import { NextRequest, NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { createScheduledDraft, getScheduler } from "@/lib/scheduler/post-scheduler";
import type { ScheduledDraftSummary, SchedulerResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

type ErrorResponse = {
  error: string;
};

type CreateDraftBody = {
  community?: unknown;
  title?: unknown;
  body?: unknown;
  imageUrl?: unknown;
  videoUrl?: unknown;
  flairId?: unknown;
  flairText?: unknown;
  plannedFor?: unknown;
  notes?: unknown;
};

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function GET(): Promise<NextResponse<SchedulerResponse | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  try {
    return NextResponse.json(await getScheduler(user.id));
  } catch (error) {
    return NextResponse.json<ErrorResponse>({ error: error instanceof Error ? error.message : "Unable to load scheduler." }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<{ draft: ScheduledDraftSummary } | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  let body: CreateDraftBody;
  try {
    body = (await request.json()) as CreateDraftBody;
  } catch {
    return NextResponse.json<ErrorResponse>({ error: "Request body must be JSON." }, { status: 400 });
  }

  try {
    const draft = await createScheduledDraft(user.id, {
      community: stringValue(body.community) ?? "",
      title: stringValue(body.title) ?? "",
      body: stringValue(body.body),
      imageUrl: stringValue(body.imageUrl),
      videoUrl: stringValue(body.videoUrl),
      flairId: stringValue(body.flairId),
      flairText: stringValue(body.flairText),
      plannedFor: stringValue(body.plannedFor),
      notes: stringValue(body.notes),
    });
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json<ErrorResponse>({ error: error instanceof Error ? error.message : "Unable to save draft." }, { status: 400 });
  }
}
