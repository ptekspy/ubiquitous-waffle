import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { buildScanQuality } from "@/lib/analytics/scan-quality";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import type { ProductOpsSettings } from "@/lib/product/ops";
import { ensureProductOpsTables } from "@/lib/product/schema";

export const dynamic = "force-dynamic";

type ErrorResponse = { error: string };
type SummaryAccount = { id: string; username: string; totalKarma: number; followerCount: number | null };
type SummaryItem = { key: string; label: string; complete: boolean; detail: string };
type HealthItem = { key: string; label: string; status: "ok" | "warn" | "off"; detail: string };

type ProductOpsSummaryResponse = {
  generatedAt: string;
  settings: ProductOpsSettings;
  activeAccount: SummaryAccount | null;
  onboarding: SummaryItem[];
  health: HealthItem[];
};

type SettingsRow = ProductOpsSettings;

async function ensureSettings(ownerUserId: string): Promise<ProductOpsSettings> {
  const rows = await prisma.$queryRaw<SettingsRow[]>`SELECT * FROM "WorkspaceSetting" WHERE "ownerUserId" = ${ownerUserId} LIMIT 1`;
  if (rows[0]) return rows[0];

  const inserted = await prisma.$queryRaw<SettingsRow[]>`
    INSERT INTO "WorkspaceSetting" ("id", "ownerUserId") VALUES (${randomUUID()}, ${ownerUserId})
    RETURNING *
  `;
  return inserted[0];
}

async function activeAccount(ownerUserId: string, settings: ProductOpsSettings): Promise<SummaryAccount | null> {
  const account = settings.activeAccountId
    ? await prisma.redditAccount.findFirst({ where: { id: settings.activeAccountId, ownerUserId }, select: { id: true, username: true, totalKarma: true, followerCount: true } })
    : null;

  return account ?? prisma.redditAccount.findFirst({ where: { ownerUserId }, orderBy: { updatedAt: "desc" }, select: { id: true, username: true, totalKarma: true, followerCount: true } });
}

async function health(ownerUserId: string, accountId: string | null): Promise<HealthItem[]> {
  const latestScan = accountId
    ? await prisma.accountScan.findFirst({
        where: { accountId },
        orderBy: { fetchedAt: "desc" },
        select: { fetchedAt: true, rawPostCount: true, rawCommentCount: true, cleanedPostCount: true, cleanedCommentCount: true, warnings: true, metadata: true },
      })
    : null;
  const latestMetric = accountId ? await prisma.accountMetricSnapshot.findFirst({ where: { accountId }, orderBy: { capturedAt: "desc" }, select: { followerCount: true } }) : null;
  const deepDive = await prisma.postDeepDiveJob.groupBy({ by: ["status"], where: { ownerUserId }, _count: { _all: true } }).catch(() => []);
  const planner = accountId ? await prisma.plannerJob.groupBy({ by: ["status"], where: { accountId }, _count: { _all: true } }).catch(() => []) : [];
  const queuedDeepDives = deepDive.find((row) => row.status === "QUEUED")?._count._all ?? 0;
  const failedPlanner = planner.find((row) => row.status === "FAILED")?._count._all ?? 0;
  const scanQuality = buildScanQuality(latestScan);

  return [
    { key: "database", label: "Database", status: "ok", detail: "Connected and responding." },
    { key: "scan", label: "Profile scan", status: latestScan ? "ok" : "warn", detail: latestScan ? `Last scan ${latestScan.fetchedAt.toLocaleString("en-GB")}` : "No profile scan saved yet." },
    { key: "scanQuality", label: scanQuality.label, status: scanQuality.status, detail: scanQuality.detail },
    { key: "followers", label: "Follower scrape", status: latestMetric?.followerCount !== null && latestMetric?.followerCount !== undefined ? "ok" : "warn", detail: latestMetric?.followerCount !== null && latestMetric?.followerCount !== undefined ? `Latest followers: ${latestMetric.followerCount}` : "Waiting for a scan with follower count." },
    { key: "deepDive", label: "Deep dives", status: queuedDeepDives > 0 ? "warn" : "ok", detail: queuedDeepDives > 0 ? `${queuedDeepDives} jobs queued.` : "No backlog detected." },
    { key: "planner", label: "Planner", status: failedPlanner > 0 ? "warn" : "ok", detail: failedPlanner > 0 ? `${failedPlanner} planner jobs failed.` : "No failed planner jobs detected." },
  ];
}

function onboarding(args: { hasAccount: boolean; hasScan: boolean; hasMetric: boolean; hasFollower: boolean; hasPlanner: boolean; hasPlannedPost: boolean; hasTracked: boolean }): SummaryItem[] {
  return [
    { key: "account", label: "Reddit account connected", complete: args.hasAccount, detail: args.hasAccount ? "Account data exists." : "Enter a username and run the first scan." },
    { key: "scan", label: "First scan complete", complete: args.hasScan, detail: args.hasScan ? "Saved scan history is available." : "Run the extension scan." },
    { key: "metrics", label: "Metric snapshots live", complete: args.hasMetric, detail: args.hasMetric ? "Karma/follower history is being saved." : "Keep dashboard open for scheduled scans." },
    { key: "followers", label: "Follower tracking live", complete: args.hasFollower, detail: args.hasFollower ? "Follower counts are being captured." : "Reload extension and run a profile scan." },
    { key: "planner", label: "Planner loop ready", complete: args.hasPlanner, detail: args.hasPlanner ? "Planner has at least one job." : "Run a manual scan with planner enabled." },
    { key: "planned", label: "Action tracking started", complete: args.hasPlannedPost, detail: args.hasPlannedPost ? "Planned posts exist." : "Create your first planned post." },
    { key: "tracked", label: "Market tracking configured", complete: args.hasTracked, detail: args.hasTracked ? "Tracked subreddit or peer exists." : "Add a subreddit or peer account." },
  ];
}

export async function GET(): Promise<NextResponse<ProductOpsSummaryResponse | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  try {
    await ensureProductOpsTables();
    const settings = await ensureSettings(user.id);
    const account = await activeAccount(user.id, settings);
    const accountId = account?.id ?? null;

    const [scanCount, metricCount, followerCount, plannerCount, plannedPostCount, trackedSubredditCount, trackedPeerCount, healthRows] = await Promise.all([
      accountId ? prisma.accountScan.count({ where: { accountId } }) : 0,
      accountId ? prisma.accountMetricSnapshot.count({ where: { accountId } }) : 0,
      accountId ? prisma.accountMetricSnapshot.count({ where: { accountId, followerCount: { not: null } } }) : 0,
      accountId ? prisma.plannerJob.count({ where: { accountId } }) : 0,
      prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "PlannedPost" WHERE "ownerUserId" = ${user.id}`,
      prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "TrackedSubreddit" WHERE "ownerUserId" = ${user.id}`,
      prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "TrackedPeerAccount" WHERE "ownerUserId" = ${user.id}`,
      health(user.id, accountId),
    ]);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      settings,
      activeAccount: account,
      onboarding: onboarding({
        hasAccount: Boolean(account),
        hasScan: scanCount > 0,
        hasMetric: metricCount > 0,
        hasFollower: followerCount > 0,
        hasPlanner: plannerCount > 0,
        hasPlannedPost: Number(plannedPostCount[0]?.count ?? 0) > 0,
        hasTracked: Number(trackedSubredditCount[0]?.count ?? 0) > 0 || Number(trackedPeerCount[0]?.count ?? 0) > 0,
      }),
      health: healthRows,
    });
  } catch (error) {
    return NextResponse.json<ErrorResponse>({ error: error instanceof Error ? error.message : "Unable to load product operations summary." }, { status: 500 });
  }
}
