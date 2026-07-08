import { prisma } from "@/lib/db/prisma";
import type { AccountMetricEvent, DashboardInsight, DashboardInsightsResponse, PostingHeatmapCell, PostImpactRow, SubredditRoiRow } from "@/lib/types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function iso(date: Date | number): string {
  return new Date(date).toISOString();
}

function compact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
  return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function cleanTitle(value: string, maxLength = 96): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length <= maxLength ? cleaned : `${cleaned.slice(0, maxLength - 1)}…`;
}

function metricDelta<T extends { capturedAt: Date; totalKarma: number; followerCount: number | null }>(metrics: T[], timestampMs: number) {
  const before = [...metrics].reverse().find((point) => point.capturedAt.getTime() <= timestampMs) ?? null;
  const after = metrics.find((point) => point.capturedAt.getTime() > timestampMs && point.capturedAt.getTime() <= timestampMs + SIX_HOURS_MS) ?? null;

  if (!before || !after) return { followerGain: null, karmaGain: null, confidence: "low" as const };

  const followerGain = before.followerCount !== null && after.followerCount !== null ? after.followerCount - before.followerCount : null;
  const karmaGain = after.totalKarma - before.totalKarma;

  return {
    followerGain,
    karmaGain,
    confidence: followerGain !== null ? (Math.abs(followerGain) > 0 || Math.abs(karmaGain) > 0 ? "high" as const : "medium" as const) : "medium" as const,
  };
}

function buildPostImpacts(posts: Array<{ id: string; title: string; subreddit: string; permalink: string; createdUtc: number; score: number; numComments: number; refreshedScore: number | null; refreshedNumComments: number | null }>, metrics: Array<{ capturedAt: Date; totalKarma: number; followerCount: number | null }>): PostImpactRow[] {
  return posts
    .map((post) => {
      const deltas = metricDelta(metrics, post.createdUtc * 1000);
      const score = post.refreshedScore ?? post.score;
      const comments = post.refreshedNumComments ?? post.numComments;
      const impactScore = score + comments * 3 + (deltas.followerGain ?? 0) * 25 + (deltas.karmaGain ?? 0) * 0.2;

      return {
        id: post.id,
        title: cleanTitle(post.title),
        subreddit: post.subreddit,
        permalink: post.permalink,
        createdAt: iso(post.createdUtc * 1000),
        score: post.score,
        comments: post.numComments,
        refreshedScore: post.refreshedScore,
        refreshedComments: post.refreshedNumComments,
        followerGain: deltas.followerGain,
        karmaGain: deltas.karmaGain,
        impactScore: Math.round(impactScore),
        confidence: deltas.confidence,
      } satisfies PostImpactRow;
    })
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, 12);
}

function buildSubredditRoi(subreddits: Array<{ subreddit: string; posts: number; comments: number; totalScore: number; averagePostScore: number; averageCommentScore: number }>, impacts: PostImpactRow[]): SubredditRoiRow[] {
  return subreddits
    .map((row) => {
      const related = impacts.filter((impact) => impact.subreddit.toLowerCase() === row.subreddit.toLowerCase());
      const followerValues = related.map((impact) => impact.followerGain).filter((value): value is number => typeof value === "number");
      const followerGain = followerValues.length > 0 ? followerValues.reduce((sum, value) => sum + value, 0) : null;
      const roiScore = Math.round(row.averagePostScore + row.averageCommentScore * 1.5 + (followerGain ?? 0) * 15 + row.posts * 2);
      const recommendation = roiScore >= 120 ? "double-down" : roiScore >= 35 ? "test-more" : "pause";

      return { subreddit: row.subreddit, posts: row.posts, comments: row.comments, totalScore: row.totalScore, averagePostScore: row.averagePostScore, averageCommentScore: row.averageCommentScore, followerGain, roiScore, recommendation } satisfies SubredditRoiRow;
    })
    .sort((a, b) => b.roiScore - a.roiScore)
    .slice(0, 12);
}

function buildHeatmap(posts: Array<{ createdUtc: number; score: number; numComments: number }>): PostingHeatmapCell[] {
  const rows = new Map<string, PostingHeatmapCell>();

  for (const post of posts) {
    const date = new Date(post.createdUtc * 1000);
    const day = date.getUTCDay();
    const hour = date.getUTCHours();
    const key = `${day}:${hour}`;
    const existing = rows.get(key) ?? { day, dayLabel: DAY_LABELS[day] ?? String(day), hour, posts: 0, totalScore: 0, averageScore: 0, totalComments: 0 };

    existing.posts += 1;
    existing.totalScore += post.score;
    existing.totalComments += post.numComments;
    existing.averageScore = Math.round(existing.totalScore / existing.posts);
    rows.set(key, existing);
  }

  return [...rows.values()].sort((a, b) => a.day - b.day || a.hour - b.hour);
}

function buildMetricEvents(posts: Array<{ id: string; title: string; subreddit: string; createdUtc: number; score: number }>, metrics: Array<{ capturedAt: Date; totalKarma: number; followerCount: number | null }>, latestScanAt?: Date): AccountMetricEvent[] {
  const since = Date.now() - WEEK_MS;
  const events: AccountMetricEvent[] = posts
    .filter((post) => post.createdUtc * 1000 >= since)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((post) => ({ id: `post:${post.id}`, type: "post", capturedAt: iso(post.createdUtc * 1000), label: `Post in r/${post.subreddit}`, detail: cleanTitle(post.title, 80), value: post.score }));

  for (let index = 1; index < metrics.length; index += 1) {
    const previous = metrics[index - 1];
    const current = metrics[index];
    const followerDelta = previous.followerCount !== null && current.followerCount !== null ? current.followerCount - previous.followerCount : 0;
    const karmaDelta = current.totalKarma - previous.totalKarma;

    if (followerDelta >= 5 || karmaDelta >= 100) {
      events.push({ id: `spike:${current.capturedAt.toISOString()}`, type: "spike", capturedAt: current.capturedAt.toISOString(), label: followerDelta >= 5 ? `+${followerDelta} followers` : `+${karmaDelta} karma`, detail: "Growth spike detected between scheduled scans.", value: followerDelta >= 5 ? followerDelta : karmaDelta });
    }
  }

  if (latestScanAt) {
    events.push({ id: `scan:${latestScanAt.toISOString()}`, type: "scan", capturedAt: latestScanAt.toISOString(), label: "Latest scan", detail: "Most recent saved profile scan." });
  }

  return events.sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()).slice(-40);
}

function buildInsights(args: { username: string; metrics: Array<{ capturedAt: Date; totalKarma: number; followerCount: number | null }>; impacts: PostImpactRow[]; roi: SubredditRoiRow[]; heatmap: PostingHeatmapCell[]; latestScanAt?: Date }): DashboardInsight[] {
  const now = new Date().toISOString();
  const insights: DashboardInsight[] = [];
  const firstMetric = args.metrics[0];
  const latestMetric = args.metrics.at(-1);

  if (firstMetric && latestMetric) {
    const karmaDelta = latestMetric.totalKarma - firstMetric.totalKarma;
    const followerDelta = firstMetric.followerCount !== null && latestMetric.followerCount !== null ? latestMetric.followerCount - firstMetric.followerCount : null;

    insights.push({ id: "growth:karma", severity: karmaDelta >= 0 ? "good" : "watch", title: `${karmaDelta >= 0 ? "+" : ""}${compact(karmaDelta)} karma this week`, detail: `u/${args.username} moved from ${compact(firstMetric.totalKarma)} to ${compact(latestMetric.totalKarma)} total karma in the visible metric window.`, timestamp: now });

    if (followerDelta !== null) {
      insights.push({ id: "growth:followers", severity: followerDelta >= 0 ? "good" : "watch", title: `${followerDelta >= 0 ? "+" : ""}${compact(followerDelta)} followers this week`, detail: `Follower scrape is working. Latest follower count is ${compact(latestMetric.followerCount)}.`, timestamp: now });
    } else {
      insights.push({ id: "growth:followers-missing", severity: "watch", title: "Follower attribution needs more points", detail: "The dashboard can attribute follower growth once the extension has saved follower counts across multiple scans.", timestamp: now });
    }
  }

  const topImpact = args.impacts[0];
  if (topImpact) insights.push({ id: `impact:${topImpact.id}`, severity: "good", title: `Top impact: r/${topImpact.subreddit}`, detail: `${topImpact.title} has ${compact(topImpact.refreshedScore ?? topImpact.score)} score and ${compact(topImpact.refreshedComments ?? topImpact.comments)} comments.`, timestamp: topImpact.createdAt });

  const bestRoi = args.roi[0];
  if (bestRoi) insights.push({ id: `roi:${bestRoi.subreddit}`, severity: bestRoi.recommendation === "pause" ? "watch" : "good", title: `Best subreddit signal: r/${bestRoi.subreddit}`, detail: `ROI score ${bestRoi.roiScore}; ${compact(bestRoi.averagePostScore)} average post score from ${bestRoi.posts} posts.`, timestamp: now });

  const bestSlot = [...args.heatmap].sort((a, b) => b.averageScore - a.averageScore || b.posts - a.posts)[0];
  if (bestSlot) insights.push({ id: `slot:${bestSlot.day}:${bestSlot.hour}`, severity: "good", title: `Best posting slot: ${bestSlot.dayLabel} ${String(bestSlot.hour).padStart(2, "0")}:00 UTC`, detail: `${bestSlot.posts} captured post${bestSlot.posts === 1 ? "" : "s"} averaged ${compact(bestSlot.averageScore)} score in this slot.`, timestamp: now });

  if (args.latestScanAt) insights.push({ id: "ops:latest-scan", severity: "neutral", title: "Latest scan saved", detail: `Dashboard insights generated from the scan captured ${args.latestScanAt.toLocaleString("en-GB")}.`, timestamp: args.latestScanAt.toISOString() });

  return insights.slice(0, 8);
}

export async function getDashboardInsights(ownerUserId: string): Promise<DashboardInsightsResponse> {
  const account = await prisma.redditAccount.findFirst({ where: { ownerUserId }, orderBy: { updatedAt: "desc" }, select: { id: true, username: true } });

  if (!account) return { generatedAt: new Date().toISOString(), account: null, insights: [], postImpacts: [], subredditRoi: [], heatmap: [], events: [] };

  const latestScan = await prisma.accountScan.findFirst({
    where: { accountId: account.id },
    orderBy: { fetchedAt: "desc" },
    include: {
      postSnapshots: { orderBy: [{ score: "desc" }, { numComments: "desc" }], take: 100, select: { id: true, title: true, subreddit: true, permalink: true, createdUtc: true, score: true, numComments: true, refreshedScore: true, refreshedNumComments: true } },
      subredditSnapshots: { orderBy: [{ totalScore: "desc" }], take: 30, select: { subreddit: true, posts: true, comments: true, totalScore: true, averagePostScore: true, averageCommentScore: true } },
    },
  });

  const metrics = await prisma.accountMetricSnapshot.findMany({ where: { accountId: account.id, capturedAt: { gte: new Date(Date.now() - WEEK_MS) } }, orderBy: { capturedAt: "asc" }, select: { capturedAt: true, totalKarma: true, followerCount: true } });

  const posts = latestScan?.postSnapshots ?? [];
  const impacts = buildPostImpacts(posts, metrics);
  const roi = buildSubredditRoi(latestScan?.subredditSnapshots ?? [], impacts);
  const heatmap = buildHeatmap(posts);
  const events = buildMetricEvents(posts, metrics, latestScan?.fetchedAt);
  const insights = buildInsights({ username: account.username, metrics, impacts, roi, heatmap, latestScanAt: latestScan?.fetchedAt });

  return { generatedAt: new Date().toISOString(), account, insights, postImpacts: impacts, subredditRoi: roi, heatmap, events };
}

export async function getPlannerInsightContext(accountId: string): Promise<string> {
  const account = await prisma.redditAccount.findUnique({ where: { id: accountId }, select: { ownerUserId: true } });
  if (!account?.ownerUserId) return "No dashboard insight context available.";

  const insightData = await getDashboardInsights(account.ownerUserId);
  const lines = [
    "Dashboard insights:",
    ...insightData.insights.slice(0, 5).map((insight) => `- ${insight.title}: ${insight.detail}`),
    "Top subreddit ROI:",
    ...insightData.subredditRoi.slice(0, 5).map((row) => `- r/${row.subreddit}: roi=${row.roiScore}, avgPost=${row.averagePostScore}, recommendation=${row.recommendation}`),
    "Top post impacts:",
    ...insightData.postImpacts.slice(0, 5).map((row) => `- r/${row.subreddit}: score=${row.refreshedScore ?? row.score}, comments=${row.refreshedComments ?? row.comments}, title=${row.title}`),
  ];

  return lines.join("\n");
}
