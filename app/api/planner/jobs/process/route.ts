import { NextRequest, NextResponse } from "next/server";

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
    return NextResponse.json({ ...result, recovered });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process planner queue.";
    return NextResponse.json<ErrorResponse>({ error: message }, { status: 500 });
  }
}
