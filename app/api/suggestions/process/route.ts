import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { processNextSuggestion } from "@/lib/suggestions/service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ErrorResponse = {
  error: string;
};

export async function POST(): Promise<NextResponse<Awaited<ReturnType<typeof processNextSuggestion>> | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  try {
    return NextResponse.json(await processNextSuggestion(user.id));
  } catch (error) {
    return NextResponse.json<ErrorResponse>({ error: error instanceof Error ? error.message : "Unable to process suggestion queue." }, { status: 500 });
  }
}
