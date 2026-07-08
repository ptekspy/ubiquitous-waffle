import { NextRequest, NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import type { AccountMetricHistory } from "@/lib/types";

export const dynamic = "force-dynamic";

type WindowKey = AccountMetricHistory["window"];

type ErrorResponse = {
  error: string;
};

const WINDOW_MS: Record<WindowKey, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

function windowKey(request: NextRequest): WindowKey {
  const value = request.nextUrl.searchParams.get("window");
  return value === "hour" || value === "week" ? value : "day";
}

export async function GET(request: NextRequest): Promise<NextResponse<AccountMetricHistory | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  const selectedWindow = windowKey(request);
  const since = new Date(Date.now() - WINDOW_MS[selectedWindow]);

  const account = await prisma.redditAccount.findFirst({
    where: { ownerUserId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (!account) {
    return NextResponse.json({ window: selectedWindow, points: [] });
  }

  const points = await prisma.accountMetricSnapshot.findMany({
    where: {
      accountId: account.id,
      capturedAt: { gte: since },
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
  });

  return NextResponse.json({
    window: selectedWindow,
    points: points.map((point) => ({
      capturedAt: point.capturedAt.toISOString(),
      totalKarma: point.totalKarma,
      linkKarma: point.linkKarma,
      commentKarma: point.commentKarma,
      awardeeKarma: point.awardeeKarma,
      awarderKarma: point.awarderKarma,
      followerCount: point.followerCount,
    })),
  });
}
