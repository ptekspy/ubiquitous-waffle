import { NextRequest, NextResponse } from "next/server";

import { buildAccountAnalytics } from "@/lib/analytics";
import { fetchRedditAccountData, RedditFetchError } from "@/lib/reddit";

export const dynamic = "force-dynamic";

type ErrorResponse = {
  error: string;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const username = request.nextUrl.searchParams.get("username");

  if (!username) {
    return NextResponse.json<ErrorResponse>({ error: "Username is required." }, { status: 400 });
  }

  try {
    const accountData = await fetchRedditAccountData(username);
    const analytics = buildAccountAnalytics(accountData);

    return NextResponse.json({
      profile: accountData.profile,
      analytics,
    });
  } catch (error) {
    if (error instanceof RedditFetchError) {
      return NextResponse.json<ErrorResponse>({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return NextResponse.json<ErrorResponse>({ error: "Unable to analyse this Reddit account." }, { status: 500 });
  }
}
