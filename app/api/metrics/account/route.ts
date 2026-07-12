import { NextRequest, NextResponse } from "next/server";

import { getDashboardInsights } from "@/lib/analytics/dashboard-insights";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import type { AccountMetricHistory } from "@/lib/types";

export const dynamic = "force-dynamic";

type WindowKey = AccountMetricHistory["window"];
type ErrorResponse = {
  error: string;
};

const WINDOW_MS: Record<Exclude<WindowKey, "all">, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  custom: 24 * 60 * 60 * 1000,
};

function windowKey(request: NextRequest): WindowKey {
  const value = request.nextUrl.searchParams.get("window");
  return value === "hour" || value === "week" || value === "all" || value === "custom" ? value : "day";
}

function parseRangeBoundary(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function positiveFollowerCount(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export async function GET(request: NextRequest): Promise<NextResponse<AccountMetricHistory | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  const selectedWindow = windowKey(request);
  const explicitFrom = parseRangeBoundary(request.nextUrl.searchParams.get("from"));
  const explicitTo = parseRangeBoundary(request.nextUrl.searchParams.get("to"));
  const since = explicitFrom ?? (selectedWindow === "all" ? null : new Date(Date.now() - WINDOW_MS[selectedWindow]));
  const until = explicitTo;

  const account = await prisma.redditAccount.findFirst({
    where: { ownerUserId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (!account) {
    return NextResponse.json({ window: selectedWindow, points: [], events: [] });
  }

  const [points, postEvents, insights] = await Promise.all([
    prisma.accountMetricSnapshot.findMany({
      where: {
        accountId: account.id,
        ...(since ? { capturedAt: { gte: since } } : {}),
        ...(until ? { capturedAt: { lte: until } } : {}),
      },
      orderBy: { capturedAt: "asc" },
      select: {
        capturedAt: true,
        totalKarma: true,
        linkKarma: true,
        commentKarma: true,
        awardeeKarma: true,
        awarderKarma: true,
        followerCount: true,
      },
    }),
    prisma.postSnapshot.findMany({
      where: {
        accountId: account.id,
        ...(since ? { createdUtc: { gte: Math.floor(since.getTime() / 1000) } } : {}),
        ...(until ? { createdUtc: { lte: Math.floor(until.getTime() / 1000) } } : {}),
      },
      distinct: ["redditId"],
      orderBy: [{ createdUtc: "asc" }, { score: "desc" }],
      take: 500,
      select: {
        redditId: true,
        title: true,
        subreddit: true,
        permalink: true,
        createdUtc: true,
        score: true,
        numComments: true,
        latestViewCount: true,
      },
    }),
    getDashboardInsights(user.id),
  ]);
  const insightEvents = insights.events.filter((event) => {
    const capturedAt = new Date(event.capturedAt).getTime();
    if (Number.isNaN(capturedAt)) return false;
    if (since && capturedAt < since.getTime()) return false;
    if (until && capturedAt > until.getTime()) return false;
    return true;
  });
  const mergedEvents = [
    ...postEvents.map((post) => ({
      id: `post:${post.redditId}`,
      type: "post" as const,
      capturedAt: new Date(post.createdUtc * 1000).toISOString(),
      label: `Post in r/${post.subreddit}`,
      detail: post.title.length > 90 ? `${post.title.slice(0, 87)}...` : post.title,
      value: post.score,
      subreddit: post.subreddit,
      permalink: post.permalink,
      comments: post.numComments,
      views: post.latestViewCount,
    })),
    ...insightEvents.filter((event) => event.type !== "post"),
  ].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());

  return NextResponse.json({
    window: selectedWindow,
    points: points.map((point) => ({
      capturedAt: point.capturedAt.toISOString(),
      totalKarma: point.totalKarma,
      linkKarma: point.linkKarma,
      commentKarma: point.commentKarma,
      awardeeKarma: point.awardeeKarma,
      awarderKarma: point.awarderKarma,
      followerCount: positiveFollowerCount(point.followerCount),
    })),
    events: mergedEvents,
  });
}
