import { randomUUID } from "crypto";

import type { Prisma } from "@prisma/client";

import { getDashboardInsights } from "@/lib/analytics/dashboard-insights";
import { prisma } from "@/lib/db/prisma";

export type ProductOpsSettings = {
  id: string;
  ownerUserId: string;
  activeAccountId: string | null;
  timezone: string;
  profileScanInterval: number;
  deepDiveInterval: number;
  deepDiveBatchSize: number;
  plannerEnabled: boolean;
  plannerModel: string | null;
  weeklyReportEnabled: boolean;
  trackedSubredditText: string;
};

export type ProductOpsResponse = {
  generatedAt: string;
  settings: ProductOpsSettings;
  accounts: Array<{ id: string; username: string; totalKarma: number; followerCount: number | null; updatedAt: string }>;
  activeAccount: { id: string; username: string; totalKarma: number; followerCount: number | null } | null;
  onboarding: Array<{ key: string; label: string; complete: boolean; detail: string }>;
  health: Array<{ key: string; label: string; status: "ok" | "warn" | "off"; detail: string }>;
  changes: Array<{ title: string; detail: string; severity: "good" | "watch" | "neutral"; timestamp: string }>;
  scans: Array<{ id: string; fetchedAt: string; source: string; posts: number; comments: number; totalPostScore: number; bestSubreddit: string | null; warnings: number }>;
  plannedPosts: Array<{ id: string; subreddit: string; title: string; format: string; plannedFor: string | null; status: string; expectedScore: number | null; expectedFollowerGain: number | null; actualScore: number | null; actualFollowerGain: number | null; rationale: string | null; notes: string | null }>;
  trackedSubreddits: Array<{ id: string; subreddit: string; enabled: boolean; notes: string | null; posts: number; averageScore: number; bestHourUtc: number | null }>;
  trackedPeers: Array<{ id: string; username: string; label: string | null; enabled: boolean; latestScore: number | null; latestFollowers: number | null; notes: string | null }>;
  weeklyReport: { title: string; bullets: string[]; generatedAt: string };
};

type SettingsRow = ProductOpsSettings;
type PlannedPostRow = ProductOpsResponse["plannedPosts"][number];
type TrackedSubredditRow = { id: string; subreddit: string; enabled: boolean; notes: string | null };
type TrackedPeerRow = ProductOpsResponse["trackedPeers"][number];

type ProductOpsAction =
  | { action: "settings:update"; values: Partial<Pick<ProductOpsSettings, "activeAccountId" | "timezone" | "profileScanInterval" | "deepDiveInterval" | "deepDiveBatchSize" | "plannerEnabled" | "plannerModel" | "weeklyReportEnabled" | "trackedSubredditText">> }
  | { action: "planned:create"; subreddit: string; title: string; format?: string; plannedFor?: string | null; expectedScore?: number | null; expectedFollowerGain?: number | null; rationale?: string | null; notes?: string | null }
  | { action: "planned:update"; id: string; status?: string; actualScore?: number | null; actualFollowerGain?: number | null; notes?: string | null }
  | { action: "subreddit:add"; subreddit: string; notes?: string | null }
  | { action: "subreddit:update"; id: string; enabled?: boolean; notes?: string | null }
  | { action: "peer:add"; username: string; label?: string | null; notes?: string | null }
  | { action: "peer:update"; id: string; enabled?: boolean; latestScore?: number | null; latestFollowers?: number | null; notes?: string | null }
  | { action: "report:generate" };

function asInt(value: unknown, fallback: number): number {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? Math.round(next) : fallback;
}

function cleanName(value: string): string {
  return String(value ?? "").trim().replace(/^r\//i, "").replace(/^u\//i, "").replace(/^@/, "");
}

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function warningCount(value: Prisma.JsonValue | null): number {
  return Array.isArray(value) ? value.length : 0;
}

function titleTokens(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length >= 4).slice(0, 8);
}

async function ensureSettings(ownerUserId: string): Promise<ProductOpsSettings> {
  const rows = await prisma.$queryRaw<SettingsRow[]>`SELECT * FROM "WorkspaceSetting" WHERE "ownerUserId" = ${ownerUserId} LIMIT 1`;
  if (rows[0]) return rows[0];

  const inserted = await prisma.$queryRaw<SettingsRow[]>`
    INSERT INTO "WorkspaceSetting" ("id", "ownerUserId") VALUES (${randomUUID()}, ${ownerUserId})
    RETURNING *
  `;
  return inserted[0];
}

async function activeAccount(ownerUserId: string, settings: ProductOpsSettings) {
  const account = settings.activeAccountId
    ? await prisma.redditAccount.findFirst({ where: { id: settings.activeAccountId, ownerUserId }, select: { id: true, username: true, totalKarma: true, followerCount: true } })
    : null;
  return account ?? prisma.redditAccount.findFirst({ where: { ownerUserId }, orderBy: { updatedAt: "desc" }, select: { id: true, username: true, totalKarma: true, followerCount: true } });
}

async function accountList(ownerUserId: string) {
  const rows = await prisma.redditAccount.findMany({ where: { ownerUserId }, orderBy: { updatedAt: "desc" }, select: { id: true, username: true, totalKarma: true, followerCount: true, updatedAt: true } });
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

async function scanHistory(accountId: string | null) {
  if (!accountId) return [];
  const rows = await prisma.accountScan.findMany({ where: { accountId }, orderBy: { fetchedAt: "desc" }, take: 20, select: { id: true, fetchedAt: true, source: true, cleanedPostCount: true, cleanedCommentCount: true, totalPostScore: true, bestSubreddit: true, warnings: true } });
  return rows.map((row) => ({ id: row.id, fetchedAt: row.fetchedAt.toISOString(), source: row.source, posts: row.cleanedPostCount, comments: row.cleanedCommentCount, totalPostScore: row.totalPostScore, bestSubreddit: row.bestSubreddit, warnings: warningCount(row.warnings) }));
}

async function plannedPosts(ownerUserId: string): Promise<ProductOpsResponse["plannedPosts"]> {
  const rows = await prisma.$queryRaw<Array<PlannedPostRow & { plannedFor: Date | null }>>`
    SELECT "id", "subreddit", "title", "format", "plannedFor", "status", "expectedScore", "expectedFollowerGain", "actualScore", "actualFollowerGain", "rationale", "notes"
    FROM "PlannedPost"
    WHERE "ownerUserId" = ${ownerUserId}
    ORDER BY COALESCE("plannedFor", "createdAt") DESC
    LIMIT 20
  `;
  return rows.map((row) => ({ ...row, plannedFor: iso(row.plannedFor) }));
}

async function bestHourForSubreddit(accountId: string, subreddit: string): Promise<number | null> {
  const posts = await prisma.postSnapshot.findMany({ where: { accountId, subreddit: { equals: subreddit, mode: "insensitive" } }, select: { createdUtc: true, score: true } });
  if (posts.length === 0) return null;

  const buckets = new Map<number, { score: number; count: number }>();
  for (const post of posts) {
    const hour = new Date(post.createdUtc * 1000).getUTCHours();
    const bucket = buckets.get(hour) ?? { score: 0, count: 0 };
    bucket.score += post.score;
    bucket.count += 1;
    buckets.set(hour, bucket);
  }

  return [...buckets.entries()].sort((a, b) => b[1].score / b[1].count - a[1].score / a[1].count)[0]?.[0] ?? null;
}

async function trackedSubreddits(ownerUserId: string, accountId: string | null): Promise<ProductOpsResponse["trackedSubreddits"]> {
  const rows = await prisma.$queryRaw<TrackedSubredditRow[]>`
    SELECT "id", "subreddit", "enabled", "notes"
    FROM "TrackedSubreddit"
    WHERE "ownerUserId" = ${ownerUserId}
    ORDER BY "createdAt" DESC
  `;

  return Promise.all(rows.map(async (row) => {
    const stats = accountId ? await prisma.subredditSnapshot.findFirst({ where: { accountId, subreddit: { equals: row.subreddit, mode: "insensitive" } }, orderBy: { createdAt: "desc" }, select: { posts: true, averagePostScore: true } }) : null;
    const bestHourUtc = accountId ? await bestHourForSubreddit(accountId, row.subreddit) : null;
    return { ...row, posts: stats?.posts ?? 0, averageScore: Math.round(stats?.averagePostScore ?? 0), bestHourUtc };
  }));
}

async function trackedPeers(ownerUserId: string): Promise<ProductOpsResponse["trackedPeers"]> {
  return prisma.$queryRaw<TrackedPeerRow[]>`
    SELECT "id", "username", "label", "enabled", "latestScore", "latestFollowers", "notes"
    FROM "TrackedPeerAccount"
    WHERE "ownerUserId" = ${ownerUserId}
    ORDER BY "createdAt" DESC
  `;
}

async function buildChanges(accountId: string | null): Promise<ProductOpsResponse["changes"]> {
  if (!accountId) return [];
  const metrics = await prisma.accountMetricSnapshot.findMany({ where: { accountId }, orderBy: { capturedAt: "desc" }, take: 2, select: { capturedAt: true, totalKarma: true, followerCount: true } });
  const latestScan = await prisma.accountScan.findFirst({ where: { accountId }, orderBy: { fetchedAt: "desc" }, select: { fetchedAt: true, cleanedPostCount: true, cleanedCommentCount: true, bestSubreddit: true, totalPostScore: true } });
  const changes: ProductOpsResponse["changes"] = [];

  if (metrics.length >= 2) {
    const [latest, previous] = metrics;
    const karmaDelta = latest.totalKarma - previous.totalKarma;
    changes.push({ title: `${karmaDelta >= 0 ? "+" : ""}${karmaDelta} karma since last scan`, detail: `Total karma moved from ${previous.totalKarma} to ${latest.totalKarma}.`, severity: karmaDelta >= 0 ? "good" : "watch", timestamp: latest.capturedAt.toISOString() });

    if (latest.followerCount !== null && previous.followerCount !== null) {
      const followerDelta = latest.followerCount - previous.followerCount;
      changes.push({ title: `${followerDelta >= 0 ? "+" : ""}${followerDelta} followers since last scan`, detail: `Follower count moved from ${previous.followerCount} to ${latest.followerCount}.`, severity: followerDelta >= 0 ? "good" : "watch", timestamp: latest.capturedAt.toISOString() });
    }
  }

  if (latestScan) {
    changes.push({ title: latestScan.bestSubreddit ? `Best current subreddit: r/${latestScan.bestSubreddit}` : "Latest scan saved", detail: `${latestScan.cleanedPostCount} posts, ${latestScan.cleanedCommentCount} comments, ${latestScan.totalPostScore} total post score captured.`, severity: "neutral", timestamp: latestScan.fetchedAt.toISOString() });
  }

  return changes;
}

async function health(ownerUserId: string, accountId: string | null): Promise<ProductOpsResponse["health"]> {
  const latestScan = accountId ? await prisma.accountScan.findFirst({ where: { accountId }, orderBy: { fetchedAt: "desc" }, select: { fetchedAt: true } }) : null;
  const latestMetric = accountId ? await prisma.accountMetricSnapshot.findFirst({ where: { accountId }, orderBy: { capturedAt: "desc" }, select: { followerCount: true } }) : null;
  const deepDive = await prisma.postDeepDiveJob.groupBy({ by: ["status"], where: { ownerUserId }, _count: { _all: true } }).catch(() => []);
  const planner = accountId ? await prisma.plannerJob.groupBy({ by: ["status"], where: { accountId }, _count: { _all: true } }).catch(() => []) : [];
  const queuedDeepDives = deepDive.find((row) => row.status === "QUEUED")?._count._all ?? 0;
  const failedPlanner = planner.find((row) => row.status === "FAILED")?._count._all ?? 0;

  return [
    { key: "database", label: "Database", status: "ok", detail: "Connected and responding." },
    { key: "scan", label: "Profile scan", status: latestScan ? "ok" : "warn", detail: latestScan ? `Last scan ${latestScan.fetchedAt.toLocaleString("en-GB")}` : "No profile scan saved yet." },
    { key: "followers", label: "Follower scrape", status: latestMetric?.followerCount !== null && latestMetric?.followerCount !== undefined ? "ok" : "warn", detail: latestMetric?.followerCount !== null && latestMetric?.followerCount !== undefined ? `Latest followers: ${latestMetric.followerCount}` : "Waiting for a scan with follower count." },
    { key: "deepDive", label: "Deep dives", status: queuedDeepDives > 0 ? "warn" : "ok", detail: queuedDeepDives > 0 ? `${queuedDeepDives} jobs queued.` : "No backlog detected." },
    { key: "planner", label: "Planner", status: failedPlanner > 0 ? "warn" : "ok", detail: failedPlanner > 0 ? `${failedPlanner} planner jobs failed.` : "No failed planner jobs detected." },
  ];
}

function onboarding(args: { hasAccount: boolean; hasScan: boolean; hasMetric: boolean; hasFollower: boolean; hasPlanner: boolean; hasPlannedPost: boolean; hasTracked: boolean }): ProductOpsResponse["onboarding"] {
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

function weeklyReport(args: { account: { username: string } | null; changes: ProductOpsResponse["changes"]; scans: ProductOpsResponse["scans"]; plannedPosts: ProductOpsResponse["plannedPosts"] }): ProductOpsResponse["weeklyReport"] {
  const bullets = [args.changes[0]?.detail ?? "No metric changes captured yet.", args.scans[0] ? `Latest scan captured ${args.scans[0].posts} posts and ${args.scans[0].comments} comments.` : "No scan history yet.", args.plannedPosts.length > 0 ? `${args.plannedPosts.length} planned/action posts are being tracked.` : "No planned posts yet; create one from the action tracker."];
  return { title: args.account ? `Weekly report for u/${args.account.username}` : "Weekly report", bullets, generatedAt: new Date().toISOString() };
}

export async function syncPlannedPostsForScan(scanId: string, accountId: string, ownerUserId?: string | null): Promise<number> {
  if (!ownerUserId) return 0;

  const posts = await prisma.postSnapshot.findMany({ where: { scanId, accountId }, select: { id: true, title: true, subreddit: true, createdUtc: true, score: true, refreshedScore: true } });
  const plans = await prisma.$queryRaw<Array<{ id: string; title: string; subreddit: string; plannedFor: Date | null }>>`
    SELECT "id", "title", "subreddit", "plannedFor"
    FROM "PlannedPost"
    WHERE "ownerUserId" = ${ownerUserId}
      AND ("accountId" IS NULL OR "accountId" = ${accountId})
      AND "linkedPostSnapshotId" IS NULL
      AND "status" IN ('PLANNED', 'POSTED')
    ORDER BY COALESCE("plannedFor", "createdAt") DESC
    LIMIT 50
  `;

  let linked = 0;

  for (const plan of plans) {
    const tokens = titleTokens(plan.title);
    const plannedAt = plan.plannedFor?.getTime() ?? null;
    const candidates = posts
      .filter((post) => post.subreddit.toLowerCase() === plan.subreddit.toLowerCase())
      .map((post) => {
        const createdAt = post.createdUtc * 1000;
        const timeScore = plannedAt === null ? 1 : Math.max(0, 48 - Math.abs(createdAt - plannedAt) / 3_600_000);
        const titleScore = tokens.filter((token) => post.title.toLowerCase().includes(token)).length * 10;
        return { post, score: timeScore + titleScore };
      })
      .filter((candidate) => candidate.score >= 1)
      .sort((a, b) => b.score - a.score);

    const match = candidates[0]?.post;
    if (!match) continue;

    await prisma.$executeRaw`
      UPDATE "PlannedPost"
      SET "linkedPostSnapshotId" = ${match.id},
          "actualScore" = ${match.refreshedScore ?? match.score},
          "status" = 'POSTED',
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${plan.id} AND "ownerUserId" = ${ownerUserId}
    `;
    linked += 1;
  }

  return linked;
}

export async function getProductOps(ownerUserId: string): Promise<ProductOpsResponse> {
  const settings = await ensureSettings(ownerUserId);
  const [accounts, account] = await Promise.all([accountList(ownerUserId), activeAccount(ownerUserId, settings)]);
  const accountId = account?.id ?? null;
  const [scans, plans, subreddits, peers, changes, healthRows, insights] = await Promise.all([scanHistory(accountId), plannedPosts(ownerUserId), trackedSubreddits(ownerUserId, accountId), trackedPeers(ownerUserId), buildChanges(accountId), health(ownerUserId, accountId), getDashboardInsights(ownerUserId).catch(() => null)]);
  const hasMetric = accountId ? await prisma.accountMetricSnapshot.count({ where: { accountId } }) > 0 : false;
  const hasFollower = accountId ? await prisma.accountMetricSnapshot.count({ where: { accountId, followerCount: { not: null } } }) > 0 : false;
  const hasPlanner = accountId ? await prisma.plannerJob.count({ where: { accountId } }) > 0 : false;
  const allChanges = [...(insights?.insights.map((insight) => ({ title: insight.title, detail: insight.detail, severity: insight.severity, timestamp: insight.timestamp })) ?? []), ...changes].slice(0, 8);

  return { generatedAt: new Date().toISOString(), settings, accounts, activeAccount: account, onboarding: onboarding({ hasAccount: Boolean(account), hasScan: scans.length > 0, hasMetric, hasFollower, hasPlanner, hasPlannedPost: plans.length > 0, hasTracked: subreddits.length > 0 || peers.length > 0 }), health: healthRows, changes: allChanges, scans, plannedPosts: plans, trackedSubreddits: subreddits, trackedPeers: peers, weeklyReport: weeklyReport({ account, changes: allChanges, scans, plannedPosts: plans }) };
}

export async function handleProductOpsAction(ownerUserId: string, action: ProductOpsAction): Promise<ProductOpsResponse> {
  const settings = await ensureSettings(ownerUserId);

  if (action.action === "settings:update") {
    const values = action.values;
    await prisma.$executeRaw`
      UPDATE "WorkspaceSetting"
      SET "activeAccountId" = ${values.activeAccountId ?? settings.activeAccountId}, "timezone" = ${cleanText(values.timezone, settings.timezone)}, "profileScanInterval" = ${asInt(values.profileScanInterval, settings.profileScanInterval)}, "deepDiveInterval" = ${asInt(values.deepDiveInterval, settings.deepDiveInterval)}, "deepDiveBatchSize" = ${asInt(values.deepDiveBatchSize, settings.deepDiveBatchSize)}, "plannerEnabled" = ${typeof values.plannerEnabled === "boolean" ? values.plannerEnabled : settings.plannerEnabled}, "plannerModel" = ${values.plannerModel === undefined ? settings.plannerModel : cleanText(values.plannerModel, "") || null}, "weeklyReportEnabled" = ${typeof values.weeklyReportEnabled === "boolean" ? values.weeklyReportEnabled : settings.weeklyReportEnabled}, "trackedSubredditText" = ${cleanText(values.trackedSubredditText, settings.trackedSubredditText)}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "ownerUserId" = ${ownerUserId}
    `;
  }

  if (action.action === "planned:create") {
    const account = await activeAccount(ownerUserId, settings);
    await prisma.$executeRaw`
      INSERT INTO "PlannedPost" ("id", "ownerUserId", "accountId", "subreddit", "title", "format", "plannedFor", "expectedScore", "expectedFollowerGain", "rationale", "notes")
      VALUES (${randomUUID()}, ${ownerUserId}, ${account?.id ?? null}, ${cleanName(action.subreddit)}, ${cleanText(action.title, "Untitled planned post")}, ${cleanText(action.format, "unknown")}, ${action.plannedFor ? new Date(action.plannedFor) : null}, ${action.expectedScore ?? null}, ${action.expectedFollowerGain ?? null}, ${action.rationale ?? null}, ${action.notes ?? null})
    `;
  }

  if (action.action === "planned:update") {
    await prisma.$executeRaw`
      UPDATE "PlannedPost"
      SET "status" = COALESCE(${action.status ?? null}, "status"), "actualScore" = COALESCE(${action.actualScore ?? null}, "actualScore"), "actualFollowerGain" = COALESCE(${action.actualFollowerGain ?? null}, "actualFollowerGain"), "notes" = COALESCE(${action.notes ?? null}, "notes"), "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${action.id} AND "ownerUserId" = ${ownerUserId}
    `;
  }

  if (action.action === "subreddit:add") {
    await prisma.$executeRaw`INSERT INTO "TrackedSubreddit" ("id", "ownerUserId", "subreddit", "notes") VALUES (${randomUUID()}, ${ownerUserId}, ${cleanName(action.subreddit)}, ${action.notes ?? null}) ON CONFLICT ("ownerUserId", "subreddit") DO UPDATE SET "enabled" = true, "notes" = EXCLUDED."notes", "updatedAt" = CURRENT_TIMESTAMP`;
  }

  if (action.action === "subreddit:update") {
    await prisma.$executeRaw`UPDATE "TrackedSubreddit" SET "enabled" = COALESCE(${action.enabled ?? null}, "enabled"), "notes" = COALESCE(${action.notes ?? null}, "notes"), "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${action.id} AND "ownerUserId" = ${ownerUserId}`;
  }

  if (action.action === "peer:add") {
    await prisma.$executeRaw`INSERT INTO "TrackedPeerAccount" ("id", "ownerUserId", "username", "label", "notes") VALUES (${randomUUID()}, ${ownerUserId}, ${cleanName(action.username)}, ${action.label ?? null}, ${action.notes ?? null}) ON CONFLICT ("ownerUserId", "username") DO UPDATE SET "enabled" = true, "label" = EXCLUDED."label", "notes" = EXCLUDED."notes", "updatedAt" = CURRENT_TIMESTAMP`;
  }

  if (action.action === "peer:update") {
    await prisma.$executeRaw`UPDATE "TrackedPeerAccount" SET "enabled" = COALESCE(${action.enabled ?? null}, "enabled"), "latestScore" = COALESCE(${action.latestScore ?? null}, "latestScore"), "latestFollowers" = COALESCE(${action.latestFollowers ?? null}, "latestFollowers"), "notes" = COALESCE(${action.notes ?? null}, "notes"), "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${action.id} AND "ownerUserId" = ${ownerUserId}`;
  }

  if (action.action === "report:generate") {
    const ops = await getProductOps(ownerUserId);
    await prisma.$executeRaw`INSERT INTO "WeeklyReport" ("id", "ownerUserId", "accountId", "weekStart", "weekEnd", "title", "summary") VALUES (${randomUUID()}, ${ownerUserId}, ${ops.activeAccount?.id ?? null}, ${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)}, ${new Date()}, ${ops.weeklyReport.title}, ${JSON.stringify(ops.weeklyReport)}::jsonb)`;
  }

  return getProductOps(ownerUserId);
}
