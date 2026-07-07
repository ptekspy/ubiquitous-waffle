import { NextRequest, NextResponse } from "next/server";

import { buildAccountAnalytics } from "@/lib/analytics";
import { requireCurrentUser } from "@/lib/auth/session";
import { saveAccountScan } from "@/lib/db/scans";
import { enqueuePlannerJobForScan } from "@/lib/planner/queue";
import { fetchRedditAccountData, RedditFetchError } from "@/lib/reddit";

export const dynamic = "force-dynamic";

type ErrorResponse = {
  error: string;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  const username = request.nextUrl.searchParams.get("username");

  if (!username) {
    return NextResponse.json<ErrorResponse>({ error: "Username is required." }, { status: 400 });
  }

  try {
    const accountData = await fetchRedditAccountData(username);
    const analytics = buildAccountAnalytics(accountData);
    const savedScan = await saveAccountScan(accountData, analytics, user.id);
    const plannerJob = await enqueuePlannerJobForScan(savedScan.scanId, user.id);

    return NextResponse.json({
      profile: accountData.profile,
      analytics,
      warnings: accountData.warnings,
      scanId: savedScan.scanId,
      plannerJob,
    });
  } catch (error) {
    if (error instanceof RedditFetchError) {
      return NextResponse.json<ErrorResponse>({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return NextResponse.json<ErrorResponse>({ error: "Unable to analyse this Reddit account." }, { status: 500 });
  }
}
