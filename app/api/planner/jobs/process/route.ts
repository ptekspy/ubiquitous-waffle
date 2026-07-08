import { NextRequest, NextResponse } from "next/server";

import { logEvent } from "@/lib/events/log";
import { recoverStalePlannerJobs } from "@/lib/planner/recovery";
import { processNextPlannerJob } from "@/lib/planner/queue";

export const dynamic = "force-dynamic";

type ErrorResponse = {
  error: string;
};

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.PLANNER_WORKER_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json<ErrorResponse>({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const recovered = await recoverStalePlannerJobs();
    const result = await processNextPlannerJob();

    if (result.processed) {
      await logEvent({
        accountId: null,
        jobId: result.job.id,
        type: "planner_job_processed",
        severity: result.job.status === "FAILED" ? "warn" : "info",
        message: `Planner job processed with status ${result.job.status}.`,
        metadata: { recovered, model: result.job.model, error: result.job.error },
      });
    } else if (recovered > 0) {
      await logEvent({ type: "planner_jobs_recovered", severity: "warn", message: `Recovered ${recovered} stale planner job(s).`, metadata: { recovered } });
    }

    return NextResponse.json({ ...result, recovered });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process planner queue.";
    await logEvent({ type: "planner_worker_failed", severity: "error", message });
    return NextResponse.json<ErrorResponse>({ error: message }, { status: 500 });
  }
}
