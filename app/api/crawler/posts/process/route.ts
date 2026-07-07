import { NextRequest, NextResponse } from "next/server";

import { processNextPostDeepDiveJob } from "@/lib/crawler/post-deep-dive";

export const dynamic = "force-dynamic";

type ErrorResponse = {
  error: string;
};

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRAWLER_WORKER_SECRET?.trim() || process.env.PLANNER_WORKER_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json<ErrorResponse>({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await processNextPostDeepDiveJob();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process post crawler queue.";
    return NextResponse.json<ErrorResponse>({ error: message }, { status: 500 });
  }
}
