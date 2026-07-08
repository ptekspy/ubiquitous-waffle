import { NextRequest, NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { getDareTracker, reviewDareCompletion, type DareTrackerResponse } from "@/lib/dares/tracker";

export const dynamic = "force-dynamic";

type ErrorResponse = { error: string };

type ReviewBody = {
  id?: unknown;
  status?: unknown;
  dareSlug?: unknown;
  completionType?: unknown;
  darerUsername?: unknown;
  notes?: unknown;
};

function status(value: unknown): "PENDING" | "VERIFIED" | "REJECTED" | null {
  return value === "PENDING" || value === "VERIFIED" || value === "REJECTED" ? value : null;
}

function completionType(value: unknown): "PLAYBOOK" | "COMMUNITY" | undefined {
  return value === "PLAYBOOK" || value === "COMMUNITY" ? value : undefined;
}

function optionalString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

export async function GET(): Promise<NextResponse<DareTrackerResponse | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  const tracker = await getDareTracker(user.id);
  return NextResponse.json(tracker);
}

export async function POST(request: NextRequest): Promise<NextResponse<DareTrackerResponse | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  let body: ReviewBody;
  try {
    body = (await request.json()) as ReviewBody;
  } catch {
    return NextResponse.json<ErrorResponse>({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (typeof body.id !== "string" || body.id.length === 0) {
    return NextResponse.json<ErrorResponse>({ error: "Missing completion id." }, { status: 400 });
  }

  const nextStatus = status(body.status);
  if (!nextStatus) {
    return NextResponse.json<ErrorResponse>({ error: "Choose PENDING, VERIFIED, or REJECTED." }, { status: 400 });
  }

  try {
    await reviewDareCompletion(user.id, {
      id: body.id,
      status: nextStatus,
      completionType: completionType(body.completionType),
      dareSlug: optionalString(body.dareSlug),
      darerUsername: optionalString(body.darerUsername),
      notes: optionalString(body.notes),
    });

    return NextResponse.json(await getDareTracker(user.id));
  } catch (error) {
    return NextResponse.json<ErrorResponse>({ error: error instanceof Error ? error.message : "Unable to update dare completion." }, { status: 400 });
  }
}
