import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { listSuggestionModels } from "@/lib/suggestions/service";

export const dynamic = "force-dynamic";

type ErrorResponse = {
  error: string;
};

export async function GET(): Promise<NextResponse<Awaited<ReturnType<typeof listSuggestionModels>> | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  try {
    return NextResponse.json(await listSuggestionModels());
  } catch (error) {
    return NextResponse.json<ErrorResponse>({ error: error instanceof Error ? error.message : "Unable to list Ollama models." }, { status: 500 });
  }
}
