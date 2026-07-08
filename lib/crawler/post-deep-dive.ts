import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { fetchRedditPostDeepDive, RedditFetchError, type RedditPostDeepDive } from "@/lib/reddit";

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

function toInputJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (!value || typeof value !== "object") return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function savePostDeepDiveResult(jobId: string, deepDive: RedditPostDeepDive): Promise<{ comments: number }> {
  const running = await prisma.postDeepDiveJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { post: true },
  });
  const estimate = estimateVotes(deepDive.post.score, deepDive.post.upvoteRatio);
  const capturedAt = new Date();
  const viewCount = deepDive.insights?.viewCount ?? null;
  const shareCount = deepDive.insights?.shareCount ?? null;
  const insightRaw = toInputJson(deepDive.insights?.raw ?? null);

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
        latestViewCount: viewCount,
        latestShareCount: shareCount,
        latestInsightAt: viewCount !== null || shareCount !== null ? capturedAt : undefined,
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
        viewCount,
        shareCount,
        insightSource: deepDive.insights?.source ?? null,
        insightRaw,
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
        lockedAt: null,
        completedAt: capturedAt,
      },
    });
  });

  return { comments: deepDive.comments.length };
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
    const saved = await savePostDeepDiveResult(running.id, deepDive);

    return {
      processed: true,
      jobId: running.id,
      status: "COMPLETED",
      comments: saved.comments,
      error: null,
    };
  } catch (error) {
    const isBlocked = error instanceof RedditFetchError && error.status === 403;
    const message = isBlocked ? "BROWSER_REQUIRED: Reddit blocked public JSON for this post." : error instanceof Error ? error.message : "Post deep-dive job failed.";
    const shouldFail = isBlocked || running.attempts >= 3;
    const status = shouldFail ? "FAILED" : "QUEUED";

    await prisma.$transaction([
      prisma.postSnapshot.update({
        where: { id: running.postSnapshotId },
        data: {
          deepDiveStatus: isBlocked ? "BROWSER_REQUIRED" : status,
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
