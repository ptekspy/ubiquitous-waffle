import { prisma } from "@/lib/db/prisma";
import type { HistoricalPerformancePoint, HistoricalPerformanceResponse, HistoricalRangePreset } from "@/lib/types";

type Observation = {
  redditId: string;
  title: string;
  subreddit: string;
  permalink: string;
  createdUtc: number;
  score: number;
  numComments: number;
  observedAt: Date;
};

type CommentObservation = {
  redditId: string;
  body: string;
  subreddit: string;
  permalink: string;
  createdUtc: number;
  score: number;
  observedAt: Date;
  viewCount: number | null;
};

type HistoricalPostRow = Observation;
type HistoricalCommentRow = CommentObservation;

type LedgerDay = Omit<HistoricalPerformancePoint, "label">;
type DateRange = { preset: HistoricalRangePreset; from: Date; to: Date };
type LedgerPatch = Partial<Omit<LedgerDay, "date" | "cumulativeScore" | "cumulativeViews">>;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PRESET: HistoricalRangePreset = "90d";
const PRESETS: Record<HistoricalRangePreset, number | null> = {
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
  all: null,
  custom: null,
};

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dateKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function dayFromUtcSeconds(value: number): string {
  return dateKey(new Date(value * 1000));
}

function parseDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function resolvePreset(value: string | null): HistoricalRangePreset {
  if (value === "30d" || value === "90d" || value === "180d" || value === "365d" || value === "all" || value === "custom") return value;
  return DEFAULT_PRESET;
}

function resolveRange(presetInput: string | null, fromInput: string | null, toInput: string | null, earliest: Date | null): DateRange {
  const explicitFrom = parseDate(fromInput);
  const to = parseDate(toInput) ?? startOfUtcDay(new Date());
  const preset = explicitFrom ? "custom" : resolvePreset(presetInput);
  const days = PRESETS[preset];

  if (explicitFrom) return { preset, from: explicitFrom, to };
  if (days === null) return { preset, from: earliest ?? addDays(to, -89), to };
  return { preset, from: addDays(to, -days + 1), to };
}

function emptyDay(key: string): LedgerDay {
  return {
    date: key,
    postScore: 0,
    commentScore: 0,
    scoreDelta: 0,
    cumulativeScore: 0,
    postsCreated: 0,
    commentsMade: 0,
    repliesReceived: 0,
    viewsDelta: null,
    cumulativeViews: null,
    sharesDelta: null,
  };
}

function addToLedger(ledger: Map<string, LedgerDay>, key: string, patch: LedgerPatch) {
  const day = ledger.get(key) ?? emptyDay(key);
  day.postScore += patch.postScore ?? 0;
  day.commentScore += patch.commentScore ?? 0;
  day.scoreDelta += patch.scoreDelta ?? 0;
  day.postsCreated += patch.postsCreated ?? 0;
  day.commentsMade += patch.commentsMade ?? 0;
  day.repliesReceived += patch.repliesReceived ?? 0;

  if (patch.viewsDelta !== undefined && patch.viewsDelta !== null) day.viewsDelta = (day.viewsDelta ?? 0) + patch.viewsDelta;
  if (patch.sharesDelta !== undefined && patch.sharesDelta !== null) day.sharesDelta = (day.sharesDelta ?? 0) + patch.sharesDelta;

  ledger.set(key, day);
}

function labelFor(key: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${key}T00:00:00.000Z`));
}

function addPostObservations(ledger: Map<string, LedgerDay>, observations: Observation[]) {
  const byPost = new Map<string, Observation[]>();

  for (const observation of observations) {
    const rows = byPost.get(observation.redditId) ?? [];
    rows.push(observation);
    byPost.set(observation.redditId, rows);
  }

  for (const rows of byPost.values()) {
    const sorted = rows
      .filter((row) => row.createdUtc > 0)
      .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());

    let previousScore: number | null = null;
    let previousComments: number | null = null;
    let countedCreation = false;

    for (const row of sorted) {
      if (previousScore === null) {
        const key = dayFromUtcSeconds(row.createdUtc);
        addToLedger(ledger, key, {
          postScore: row.score,
          scoreDelta: row.score,
          postsCreated: countedCreation ? 0 : 1,
          repliesReceived: row.numComments,
        });
        countedCreation = true;
      } else {
        const scoreDelta = row.score - previousScore;
        const commentDelta = Math.max(0, row.numComments - (previousComments ?? row.numComments));
        addToLedger(ledger, dateKey(row.observedAt), {
          postScore: scoreDelta,
          scoreDelta,
          repliesReceived: commentDelta,
        });
      }

      previousScore = row.score;
      previousComments = row.numComments;
    }
  }
}

function addCommentObservations(ledger: Map<string, LedgerDay>, comments: CommentObservation[]) {
  const byComment = new Map<string, CommentObservation[]>();

  for (const comment of comments) {
    const rows = byComment.get(comment.redditId) ?? [];
    rows.push(comment);
    byComment.set(comment.redditId, rows);
  }

  for (const rows of byComment.values()) {
    const sorted = rows
      .filter((row) => row.createdUtc > 0)
      .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());

    let previousScore: number | null = null;
    let previousViews: number | null = null;
    let countedCreation = false;

    for (const row of sorted) {
      if (previousScore === null) {
        const key = dayFromUtcSeconds(row.createdUtc);
        addToLedger(ledger, key, {
          commentScore: row.score,
          scoreDelta: row.score,
          commentsMade: countedCreation ? 0 : 1,
        });
        countedCreation = true;
      } else {
        const scoreDelta = row.score - previousScore;
        addToLedger(ledger, dateKey(row.observedAt), {
          commentScore: scoreDelta,
          scoreDelta,
        });
      }

      if (row.viewCount !== null) {
        const viewsDelta = previousViews === null ? row.viewCount : Math.max(0, row.viewCount - previousViews);
        addToLedger(ledger, dateKey(row.observedAt), { viewsDelta });
        previousViews = row.viewCount;
      }

      previousScore = row.score;
    }
  }
}

function finalise(ledger: Map<string, LedgerDay>, range: DateRange): HistoricalPerformancePoint[] {
  const keys = [...ledger.keys()].sort();
  const startKey = keys[0] ?? dateKey(range.from);
  let cursor = new Date(`${startKey}T00:00:00.000Z`);
  const end = range.to;
  let cumulativeScore = 0;
  let cumulativeViews: number | null = null;
  const output: HistoricalPerformancePoint[] = [];

  while (cursor <= end) {
    const key = dateKey(cursor);
    const day = ledger.get(key) ?? emptyDay(key);
    cumulativeScore += day.scoreDelta;
    if (day.viewsDelta !== null) cumulativeViews = (cumulativeViews ?? 0) + day.viewsDelta;

    if (cursor >= range.from) {
      output.push({
        ...day,
        cumulativeScore,
        cumulativeViews,
        label: labelFor(key),
      });
    }

    cursor = addDays(cursor, 1);
  }

  return output;
}

async function getHistoricalPostRows(ownerUserId: string): Promise<HistoricalPostRow[]> {
  return prisma.$queryRaw<HistoricalPostRow[]>`
    SELECT "redditId", "title", "subreddit", "permalink", "createdUtc", "score", "numComments", "observedAt"
    FROM "HistoricalPostObservation"
    WHERE "ownerUserId" = ${ownerUserId}
    ORDER BY "observedAt" ASC
  `;
}

async function getHistoricalCommentRows(ownerUserId: string): Promise<HistoricalCommentRow[]> {
  return prisma.$queryRaw<HistoricalCommentRow[]>`
    SELECT "redditId", "body", "subreddit", "permalink", "createdUtc", "score", "observedAt", "viewCount"
    FROM "HistoricalCommentObservation"
    WHERE "ownerUserId" = ${ownerUserId}
    ORDER BY "observedAt" ASC
  `;
}

async function getLivePostObservations(ownerUserId: string): Promise<Observation[]> {
  const accounts = await prisma.redditAccount.findMany({ where: { ownerUserId }, select: { id: true } });
  const accountIds = accounts.map((account) => account.id);
  if (accountIds.length === 0) return [];

  const snapshots = await prisma.postSnapshot.findMany({
    where: { accountId: { in: accountIds } },
    select: {
      redditId: true,
      title: true,
      subreddit: true,
      permalink: true,
      createdUtc: true,
      score: true,
      numComments: true,
      scan: { select: { fetchedAt: true, capturedAt: true } },
      metricSnapshots: {
        orderBy: { capturedAt: "asc" },
        select: { capturedAt: true, score: true, numComments: true },
      },
    },
  });

  const observations: Observation[] = [];
  const seen = new Set<string>();

  for (const post of snapshots) {
    const observedAt = post.scan.capturedAt ?? post.scan.fetchedAt;
    const baseKey = `${post.redditId}:${observedAt.toISOString()}:${post.score}:${post.numComments}`;
    if (!seen.has(baseKey)) {
      observations.push({ ...post, observedAt });
      seen.add(baseKey);
    }

    for (const metric of post.metricSnapshots) {
      const key = `${post.redditId}:${metric.capturedAt.toISOString()}:${metric.score}:${metric.numComments}`;
      if (seen.has(key)) continue;
      observations.push({
        redditId: post.redditId,
        title: post.title,
        subreddit: post.subreddit,
        permalink: post.permalink,
        createdUtc: post.createdUtc,
        score: metric.score,
        numComments: metric.numComments,
        observedAt: metric.capturedAt,
      });
      seen.add(key);
    }
  }

  return observations;
}

async function getLiveCommentObservations(ownerUserId: string): Promise<CommentObservation[]> {
  const accounts = await prisma.redditAccount.findMany({ where: { ownerUserId }, select: { id: true } });
  const accountIds = accounts.map((account) => account.id);
  if (accountIds.length === 0) return [];

  const comments = await prisma.commentSnapshot.findMany({
    where: { accountId: { in: accountIds } },
    select: {
      redditId: true,
      body: true,
      subreddit: true,
      permalink: true,
      createdUtc: true,
      score: true,
      scan: { select: { fetchedAt: true, capturedAt: true } },
    },
  });

  return comments.map((comment) => ({
    redditId: comment.redditId,
    body: comment.body,
    subreddit: comment.subreddit,
    permalink: comment.permalink,
    createdUtc: comment.createdUtc,
    score: comment.score,
    observedAt: comment.scan.capturedAt ?? comment.scan.fetchedAt,
    viewCount: null,
  }));
}

function summary(points: HistoricalPerformancePoint[]): HistoricalPerformanceResponse["summary"] {
  const viewsValues = points.map((point) => point.viewsDelta).filter((value): value is number => value !== null);
  return {
    postScore: points.reduce((sum, point) => sum + point.postScore, 0),
    commentScore: points.reduce((sum, point) => sum + point.commentScore, 0),
    scoreDelta: points.reduce((sum, point) => sum + point.scoreDelta, 0),
    postsCreated: points.reduce((sum, point) => sum + point.postsCreated, 0),
    commentsMade: points.reduce((sum, point) => sum + point.commentsMade, 0),
    repliesReceived: points.reduce((sum, point) => sum + point.repliesReceived, 0),
    viewsDelta: viewsValues.length > 0 ? viewsValues.reduce((sum, value) => sum + value, 0) : null,
  };
}

export async function getHistoricalPerformance(ownerUserId: string, params: { preset?: string | null; from?: string | null; to?: string | null }): Promise<HistoricalPerformanceResponse> {
  const [historicalPosts, historicalComments, livePosts, liveComments] = await Promise.all([
    getHistoricalPostRows(ownerUserId).catch(() => []),
    getHistoricalCommentRows(ownerUserId).catch(() => []),
    getLivePostObservations(ownerUserId),
    getLiveCommentObservations(ownerUserId),
  ]);

  const observations = [...historicalPosts, ...livePosts];
  const comments = [...historicalComments, ...liveComments];
  const earliestDates = [
    ...observations.map((row) => new Date(row.createdUtc * 1000)),
    ...comments.map((row) => new Date(row.createdUtc * 1000)),
  ].filter((date) => Number.isFinite(date.getTime()));
  const earliest = earliestDates.length > 0 ? startOfUtcDay(new Date(Math.min(...earliestDates.map((date) => date.getTime())))) : null;
  const range = resolveRange(params.preset ?? null, params.from ?? null, params.to ?? null, earliest);
  const ledger = new Map<string, LedgerDay>();

  addPostObservations(ledger, observations);
  addCommentObservations(ledger, comments);

  const points = finalise(ledger, range);

  return {
    generatedAt: new Date().toISOString(),
    preset: range.preset,
    from: dateKey(range.from),
    to: dateKey(range.to),
    summary: summary(points),
    points,
  };
}
