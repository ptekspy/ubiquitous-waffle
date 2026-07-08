import { prisma } from "@/lib/db/prisma";
import { processNextPostDeepDiveJob } from "@/lib/crawler/post-deep-dive";

const DEFAULT_DEEP_DIVE_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;

export type ScheduledDeepDiveRefreshResult =
  | { processed: true; mode: "queued" | "processed"; jobId?: string; status?: string; comments?: number; error?: string | null }
  | { processed: false; reason: string };

function deepDiveRefreshIntervalMs(): number {
  const parsed = Number.parseInt(process.env.DEEP_DIVE_REFRESH_INTERVAL_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DEEP_DIVE_REFRESH_INTERVAL_MS;
}

async function findDuePostSnapshot() {
  const cutoff = new Date(Date.now() - deepDiveRefreshIntervalMs());

  return prisma.postSnapshot.findFirst({
    where: {
      scan: {
        account: {
          ownerUserId: { not: null },
        },
      },
      OR: [{ deepDiveFetchedAt: null }, { deepDiveFetchedAt: { lte: cutoff } }],
      deepDiveJobs: {
        none: {
          status: { in: ["QUEUED", "RUNNING"] },
        },
      },
    },
    include: {
      scan: {
        include: {
          account: true,
        },
      },
    },
    orderBy: [{ deepDiveFetchedAt: "asc" }, { score: "desc" }, { createdAt: "desc" }],
  });
}

export async function processNextScheduledDeepDiveRefresh(): Promise<ScheduledDeepDiveRefreshResult> {
  const existing = await processNextPostDeepDiveJob();
  if (existing.processed) {
    return {
      processed: true,
      mode: "processed",
      jobId: existing.jobId,
      status: existing.status,
      comments: existing.comments,
      error: existing.error,
    };
  }

  const post = await findDuePostSnapshot();
  if (!post) return { processed: false, reason: "No posts are due for a deep-dive refresh." };

  const job = await prisma.postDeepDiveJob.create({
    data: {
      ownerUserId: post.scan.account.ownerUserId,
      postSnapshotId: post.id,
      status: "QUEUED",
    },
  });

  const processed = await processNextPostDeepDiveJob();
  if (!processed.processed) {
    return { processed: true, mode: "queued", jobId: job.id, status: "QUEUED", comments: 0, error: processed.reason };
  }

  return {
    processed: true,
    mode: "processed",
    jobId: processed.jobId,
    status: processed.status,
    comments: processed.comments,
    error: processed.error,
  };
}
