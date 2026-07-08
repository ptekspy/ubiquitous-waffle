import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { getPostInsights } from "@/lib/analytics/post-insights";
import type { PostInsightsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

type ErrorResponse = { error: string };

export async function GET(): Promise<NextResponse<PostInsightsResponse | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  const insights = await getPostInsights(user.id);
  return NextResponse.json(insights);
}
