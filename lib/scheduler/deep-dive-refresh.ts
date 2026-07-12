import { processNextPostDeepDiveJob } from "@/lib/crawler/post-deep-dive";
import { createDuePostDeepDiveJobs } from "@/lib/crawler/deep-dive-queue";

export type ScheduledDeepDiveRefreshResult =
  | { processed: true; mode: "queued" | "processed"; jobId?: string; status?: string; comments?: number; error?: string | null }
  | { processed: false; reason: string };

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

  const queued = await createDuePostDeepDiveJobs(null, 1);
  if (queued === 0) return { processed: false, reason: "No posts are due for a deep-dive refresh." };

  const processed = await processNextPostDeepDiveJob();
  if (!processed.processed) {
    return { processed: true, mode: "queued", status: "QUEUED", comments: 0, error: processed.reason };
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
