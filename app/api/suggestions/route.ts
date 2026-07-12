import { NextRequest, NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { getSuggestions, listSuggestionModels, queueSuggestions } from "@/lib/suggestions/service";
import type { PostSuggestionSummary, SuggestionsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

type ErrorResponse = {
  error: string;
};

type CreateBody = {
  models?: unknown;
  model?: unknown;
};

function modelList(body: CreateBody, defaultModel: string | null): string[] {
  if (Array.isArray(body.models)) {
    return body.models.filter((model): model is string => typeof model === "string" && model.trim().length > 0).map((model) => model.trim());
  }

  if (typeof body.model === "string" && body.model.trim()) return [body.model.trim()];
  return defaultModel ? [defaultModel] : [];
}

export async function GET(): Promise<NextResponse<SuggestionsResponse | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  const suggestions = await getSuggestions(user.id);
  return NextResponse.json(suggestions);
}

export async function POST(request: NextRequest): Promise<NextResponse<{ queued: PostSuggestionSummary[] } | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    body = {};
  }

  try {
    const modelData = await listSuggestionModels();
    const selectedModels = modelList(body, modelData.defaultModel);
    const queued = await queueSuggestions(user.id, selectedModels);
    return NextResponse.json({ queued });
  } catch (error) {
    return NextResponse.json<ErrorResponse>({ error: error instanceof Error ? error.message : "Unable to queue suggestions." }, { status: 500 });
  }
}
