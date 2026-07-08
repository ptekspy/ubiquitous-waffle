import { NextRequest, NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { getHistoricalPerformance } from "@/lib/analytics/historical-performance";
import type { HistoricalPerformanceResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

type ErrorResponse = { error: string };

export async function GET(request: NextRequest): Promise<NextResponse<HistoricalPerformanceResponse | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  try {
    const params = request.nextUrl.searchParams;
    const history = await getHistoricalPerformance(user.id, {
      preset: params.get("preset"),
      from: params.get("from"),
      to: params.get("to"),
    });
    return NextResponse.json(history);
  } catch (error) {
    return NextResponse.json<ErrorResponse>({ error: error instanceof Error ? error.message : "Unable to load historical performance." }, { status: 500 });
  }
}
