import { prisma } from "@/lib/db/prisma";
import { fetchRedditPostDeepDive } from "@/lib/reddit";

export type ProcessPostDeepDiveResult =
  | { processed: true; jobId: string; status: "COMPLETED" | "QUEUED" | "FAILED"; comments: number; error: string | null }
  | { processed: false; reason: string };

type VoteEstimate = {
  estimatedUpvotes: number | null;
  estimatedDownvotes: number | null;
};

function estimateVotes(score: number, ratio: number | null): VoteEstimate {
  if (ratio === null || ratio <= 0 || ratio >= 1) {
    return { estimatedUpvotes: null, estimatedDownvotes: null };
  }

  const denominator = 2 * ratio - 1;
  if (denominator <= 0.05 || score <= 0) {
    return { estimatedUpvotes: null, estimatedDownvotes: null };
  }

  const totalVotes = Math.max(score / denominator, score);
  const estimatedUpvotes = Math.max(0, Math.round(totalVotes * ratio));
  const estimatedDownvotes = Math.max(0, Math.round(totalVotes * (1 - ratio)));

  return { estimatedUpvotes, estimatedDownvotes };
}

export async function processNextPostDeepDiveJob(): Promise<ProcessPostDeepDiveResult> {
  const queued = await prisma.postDeepDiveJob.findFirst({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
  });

  if (!queued) return { processed: false, reason: "No queued post deep-dive jobs." };

  const claimed = await prisma.postDeepDiveJob.updateMany({
    where: { id: queued.id, status: "QUEUED" },
    data: {
      status: "RUNNING",
      lockedAt: new Date(),
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });

  if (claimed.count !== 1) return { processed: false, reason: "Queued post deep-dive job was claimed by another worker." };

  const running = await prisma.postDeepDiveJob.findUniqueOrThrow({
    where: { id: queued.id },
    include: { post: true },
  });

  try {
    const deepDive = await fetchRedditPostDeepDive(running.post.redditId);
    const estimate = estimateVotes(deepDive.post.score, deepDive.post.upvoteRatio);
    const capturedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.postSnapshot.update({
        where: { id: running.postSnapshotId },
        data: {
          deepDiveStatus: "COMPLETED",
          deepDiveFetchedAt: capturedAt,
          refreshedScore: deepDive.post.score,
          refreshedNumComments: deepDive.post.numComments,
          refreshedUpvoteRatio: deepDive.post.upvoteRatio,
          estimatedUpvotes: estimate.estimatedUpvotes,
          estimatedDownvotes: estimate.estimatedDownvotes,
        },
      });

      await tx.postMetricSnapshot.create({
        data: {
          postSnapshotId: running.postSnapshotId,
          score: deepDive.post.score,
          numComments: deepDive.post.numComments,
          upvoteRatio: deepDive.post.upvoteRatio,
          estimatedUpvotes: estimate.estimatedUpvotes,
          estimatedDownvotes: estimate.estimatedDownvotes,
          capturedAt,
        },
      });

      await tx.postThreadComment.deleteMany({
        where: { postSnapshotId: running.postSnapshotId },
      });

      if (deepDive.comments.length > 0) {
        await tx.postThreadComment.createMany({
          data: deepDive.comments.map((comment) => ({
            postSnapshotId: running.postSnapshotId,
            redditId: comment.redditId,
            parentRedditId: comment.parentRedditId,
            author: comment.author,
            body: comment.body,
            subreddit: comment.subreddit,
            permalink: comment.permalink,
            createdUtc: comment.createdUtc,
            score: comment.score,
            depth: comment.depth,
            isSubmitter: comment.isSubmitter,
            distinguished: comment.distinguished,
          })),
          skipDuplicates: true,
        });
      }

      await tx.postDeepDiveJob.update({
        where: { id: running.id },
        data: {
          status: "COMPLETED",
          error: null,
          completedAt: capturedAt,
        },
      });
    });

    return {
      processed: true,
      jobId: running.id,
      status: "COMPLETED",
      comments: deepDive.comments.length,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Post deep-dive job failed.";
    const shouldFail = running.attempts >= 3;
    const status = shouldFail ? "FAILED" : "QUEUED";

    await prisma.$transaction([
      prisma.postSnapshot.update({
        where: { id: running.postSnapshotId },
        data: {
          deepDiveStatus: status,
        },
      }),
      prisma.postDeepDiveJob.update({
        where: { id: running.id },
        data: {
          status,
          error: message,
          lockedAt: null,
          completedAt: shouldFail ? new Date() : null,
        },
      }),
    ]);

    return {
      processed: true,
      jobId: running.id,
      status,
      comments: 0,
      error: message,
    };
  }
}
