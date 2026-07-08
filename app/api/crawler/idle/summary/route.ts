import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { getIdleCrawlerSummary } from "@/lib/crawler/idle";

export const dynamic = "force-dynamic";

type ErrorResponse = {
  error: string;
};

export async function GET(): Promise<NextResponse> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  try {
    const summary = await getIdleCrawlerSummary(user.id);
    return NextResponse.json(summary);
  } catch (error) {
    console.error(error);
    return NextResponse.json<ErrorResponse>({ error: error instanceof Error ? error.message : "Unable to load idle crawler data." }, { status: 500 });
  }
}
