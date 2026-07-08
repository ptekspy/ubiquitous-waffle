import { NextResponse } from "next/server";

import { getDashboardInsights } from "@/lib/analytics/dashboard-insights";
import { requireCurrentUser } from "@/lib/auth/session";
import type { DashboardInsightsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

type ErrorResponse = {
  error: string;
};

export async function GET(): Promise<NextResponse<DashboardInsightsResponse | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  const insights = await getDashboardInsights(user.id);
  return NextResponse.json(insights);
}
