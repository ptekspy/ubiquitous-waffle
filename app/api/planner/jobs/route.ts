import { NextRequest, NextResponse } from "next/server";

import { enqueuePlannerJobForScan, getPlannerJob } from "@/lib/planner/queue";

type ErrorResponse = {
  error: string;
};

type CreatePlannerJobBody = {
  scanId?: unknown;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const jobId = request.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json<ErrorResponse>({ error: "jobId is required." }, { status: 400 });
  }

  const job = await getPlannerJob(jobId);
  if (!job) {
    return NextResponse.json<ErrorResponse>({ error: "Planner job not found." }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: CreatePlannerJobBody;

  try {
    body = (await request.json()) as CreatePlannerJobBody;
  } catch {
    return NextResponse.json<ErrorResponse>({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (typeof body.scanId !== "string" || body.scanId.trim().length === 0) {
    return NextResponse.json<ErrorResponse>({ error: "scanId is required." }, { status: 400 });
  }

  try {
    const job = await enqueuePlannerJobForScan(body.scanId);
    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to enqueue planner job.";
    return NextResponse.json<ErrorResponse>({ error: message }, { status: 500 });
  }
}
