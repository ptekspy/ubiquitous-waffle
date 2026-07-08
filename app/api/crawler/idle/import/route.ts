import { NextRequest, NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { saveIdleCrawlerFailure, saveIdleCrawlerPayload } from "@/lib/crawler/idle";

export const dynamic = "force-dynamic";

type ErrorResponse = {
  error: string;
};

type ImportBody = {
  targetId?: unknown;
  payload?: unknown;
  error?: unknown;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return NextResponse.json<ErrorResponse>({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (typeof body.targetId !== "string" || body.targetId.trim().length === 0) {
    return NextResponse.json<ErrorResponse>({ error: "targetId is required." }, { status: 400 });
  }

  try {
    if (typeof body.error === "string" && body.error.trim().length > 0) {
      await saveIdleCrawlerFailure(user.id, body.targetId, body.error);
      return NextResponse.json({ ok: true, failed: true });
    }

    const saved = await saveIdleCrawlerPayload(user.id, body.targetId, body.payload);
    return NextResponse.json({ ok: true, ...saved });
  } catch (error) {
    console.error(error);
    return NextResponse.json<ErrorResponse>({ error: error instanceof Error ? error.message : "Unable to import idle crawler payload." }, { status: 500 });
  }
}
