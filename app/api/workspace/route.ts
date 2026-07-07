import { NextRequest, NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { getWorkspaceForUser, updateWorkspaceRedditUsername } from "@/lib/db/dashboard";
import { isValidRedditUsername } from "@/utils/is-valid-reddit-username";
import { normaliseRedditUsername } from "@/utils/normalise-reddit-username";

export const dynamic = "force-dynamic";

type ErrorResponse = {
  error: string;
};

type PatchWorkspaceBody = {
  redditUsername?: unknown;
};

export async function GET(): Promise<NextResponse> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  const workspace = await getWorkspaceForUser(user.id);
  return NextResponse.json(workspace);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  let body: PatchWorkspaceBody;

  try {
    body = (await request.json()) as PatchWorkspaceBody;
  } catch {
    return NextResponse.json<ErrorResponse>({ error: "Request body must be JSON." }, { status: 400 });
  }

  const redditUsername = normaliseRedditUsername(typeof body.redditUsername === "string" ? body.redditUsername : "");
  if (!isValidRedditUsername(redditUsername)) {
    return NextResponse.json<ErrorResponse>({ error: "Enter a valid Reddit username." }, { status: 400 });
  }

  await updateWorkspaceRedditUsername(user.id, redditUsername);
  const workspace = await getWorkspaceForUser(user.id);
  return NextResponse.json(workspace);
}
