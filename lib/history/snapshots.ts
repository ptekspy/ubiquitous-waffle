import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { parseHistoricalSnapshotContent, type ParsedHistoricalComment, type ParsedHistoricalPost, type ParsedProfileMetrics } from "./snapshot-parser";

type SnapshotImportInput = {
  ownerUserId: string;
  capturedAt: Date;
  content: string;
  sourceFileName?: string | null;
  username?: string | null;
};

export type SnapshotImportResult = {
  snapshotId: string;
  capturedAt: string;
  source: string;
  sourceFileName: string | null;
  postCount: number;
  commentCount: number;
  username: string | null;
  accountMetricImported: boolean;
  profileMetrics: ParsedProfileMetrics;
};

export type ReparseFollowerResult = {
  snapshotsChecked: number;
  snapshotsReparsed: number;
  followerSnapshotsImported: number;
  skippedWithoutStoredContent: number;
  skippedWithoutFollowers: number;
  zeroMetricSnapshotsDeleted: number;
  zeroAccountFollowersCleared: number;
};

export type HistoricalSnapshotSummary = {
  id: string;
  capturedAt: string;
  importedAt: string;
  source: string;
  sourceFileName: string | null;
  postCount: number;
  commentCount: number;
};

type SnapshotRow = {
  id: string;
  capturedAt: Date;
  importedAt: Date;
  source: string;
  sourceFileName: string | null;
  postCount: number;
  commentCount: number;
};

type ExistingSnapshotRow = { id: string };
type CountRow = { count: number | bigint };
type SnapshotForReparseRow = {
  id: string;
  accountId: string | null;
  capturedAt: Date;
  metadata: unknown;
};

type AccountRow = {
  id: string;
  username: string;
  totalKarma: number;
  linkKarma: number;
  commentKarma: number;
  awardeeKarma: number;
  awarderKarma: number;
  followerCount: number | null;
};

function countValue(rows: CountRow[]): number {
  return Number(rows[0]?.count ?? 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function htmlDecode(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function stripTags(value: string): string {
  return htmlDecode(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function compactNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;

  const clean = value.trim().replace(/,/g, "").replace(/\s+/g, "");
  const match = clean.match(/^(-?\d+(?:\.\d+)?)([kKmMbB])?$/);
  if (!match) {
    const parsed = Number.parseInt(clean, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base)) return null;
  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
  return Math.round(base * multiplier);
}

function positiveFollowerCount(value: unknown): number | null {
  const parsed = compactNumberValue(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function parsePositiveFollowerCountFromProfileHtml(raw: string): number | null {
  const marker = raw.search(/data-testid=["']profile-followers-widget["']|profile-followers-widget|followers-widget/i);
  if (marker === -1) return null;

  const widget = raw.slice(marker, Math.min(raw.length, marker + 2500));
  const text = stripTags(widget);
  const match = text.match(/\b([0-9][0-9,.]*(?:\.[0-9]+)?\s*[kKmMbB]?)\s+followers?\b/i);
  return match ? positiveFollowerCount(match[1]) : null;
}

function hasAnyProfileMetric(metrics: ParsedProfileMetrics): boolean {
  return metrics.totalKarma !== null || metrics.linkKarma !== null || metrics.commentKarma !== null || metrics.awardeeKarma !== null || metrics.awarderKarma !== null || metrics.followerCount !== null;
}

function normaliseProfileMetrics(metrics: ParsedProfileMetrics, username: string | null, rawContent?: string | null): ParsedProfileMetrics {
  return {
    ...metrics,
    username,
    followerCount: positiveFollowerCount(metrics.followerCount) ?? (rawContent ? parsePositiveFollowerCountFromProfileHtml(rawContent) : null),
  };
}

function metadataWithImportContent(metadata: Record<string, unknown>, rawContent: string, profileMetrics: ParsedProfileMetrics): Record<string, unknown> {
  const existingImport = isRecord(metadata.import) ? metadata.import : {};
  return {
    ...metadata,
    profileMetrics,
    import: {
      ...existingImport,
      rawContent,
      rawContentLength: rawContent.length,
      rawContentStoredAt: new Date().toISOString(),
    },
  };
}

function storedRawContent(metadata: unknown): string | null {
  if (!isRecord(metadata)) return null;
  if (typeof metadata.rawContent === "string" && metadata.rawContent.trim()) return metadata.rawContent;
  const importMetadata = metadata.import;
  if (isRecord(importMetadata) && typeof importMetadata.rawContent === "string" && importMetadata.rawContent.trim()) return importMetadata.rawContent;
  return null;
}

function profileMetricsFromMetadata(metadata: unknown): ParsedProfileMetrics | null {
  if (!isRecord(metadata) || !isRecord(metadata.profileMetrics)) return null;
  const rawMetrics = metadata.profileMetrics;
  const followerCount = positiveFollowerCount(rawMetrics.followerCount);
  if (followerCount === null) return null;

  return {
    username: typeof rawMetrics.username === "string" ? rawMetrics.username : null,
    totalKarma: compactNumberValue(rawMetrics.totalKarma),
    linkKarma: compactNumberValue(rawMetrics.linkKarma),
    commentKarma: compactNumberValue(rawMetrics.commentKarma),
    awardeeKarma: compactNumberValue(rawMetrics.awardeeKarma),
    awarderKarma: compactNumberValue(rawMetrics.awarderKarma),
    followerCount,
    raw: { parser: "historical-snapshot-metadata" },
  };
}

async function cleanupZeroFollowerCounts(ownerUserId: string): Promise<Pick<ReparseFollowerResult, "zeroMetricSnapshotsDeleted" | "zeroAccountFollowersCleared">> {
  const deletedMetricRows = await prisma.$queryRaw<CountRow[]>`
    WITH deleted AS (
      DELETE FROM "AccountMetricSnapshot" metric
      USING "Account" account
      WHERE metric."accountId" = account."id"
        AND account."ownerUserId" = ${ownerUserId}
        AND metric."followerCount" = 0
      RETURNING metric."id"
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `;

  const clearedAccountRows = await prisma.$queryRaw<CountRow[]>`
    WITH updated AS (
      UPDATE "Account"
      SET "followerCount" = NULL
      WHERE "ownerUserId" = ${ownerUserId}
        AND "followerCount" = 0
      RETURNING "id"
    )
    SELECT COUNT(*)::int AS count FROM updated
  `;

  return {
    zeroMetricSnapshotsDeleted: countValue(deletedMetricRows),
    zeroAccountFollowersCleared: countValue(clearedAccountRows),
  };
}

async function accountById(accountId: string): Promise<AccountRow | null> {
  return prisma.redditAccount.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      username: true,
      totalKarma: true,
      linkKarma: true,
      commentKarma: true,
      awardeeKarma: true,
      awarderKarma: true,
      followerCount: true,
    },
  });
}

async function findOrCreateAccount(ownerUserId: string, username: string | null, metrics: ParsedProfileMetrics): Promise<AccountRow | null> {
  const cleanUsername = username?.trim();
  const existing = await prisma.redditAccount.findFirst({
    where: {
      ownerUserId,
      ...(cleanUsername ? { username: cleanUsername } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      username: true,
      totalKarma: true,
      linkKarma: true,
      commentKarma: true,
      awardeeKarma: true,
      awarderKarma: true,
      followerCount: true,
    },
  });

  if (existing) {
    const update: Record<string, number | null> = {};
    if (existing.totalKarma === 0 && metrics.totalKarma !== null) update.totalKarma = metrics.totalKarma;
    if (existing.linkKarma === 0 && metrics.linkKarma !== null) update.linkKarma = metrics.linkKarma;
    if (existing.commentKarma === 0 && metrics.commentKarma !== null) update.commentKarma = metrics.commentKarma;
    if (existing.awardeeKarma === 0 && metrics.awardeeKarma !== null) update.awardeeKarma = metrics.awardeeKarma;
    if (existing.awarderKarma === 0 && metrics.awarderKarma !== null) update.awarderKarma = metrics.awarderKarma;
    if ((existing.followerCount === null || existing.followerCount <= 0) && metrics.followerCount !== null) update.followerCount = metrics.followerCount;

    if (Object.keys(update).length > 0) {
      await prisma.redditAccount.update({ where: { id: existing.id }, data: update });
      return { ...existing, ...update } as AccountRow;
    }

    return existing;
  }

  if (!cleanUsername) {
    const latest = await prisma.redditAccount.findFirst({
      where: { ownerUserId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        username: true,
        totalKarma: true,
        linkKarma: true,
        commentKarma: true,
        awardeeKarma: true,
        awarderKarma: true,
        followerCount: true,
      },
    });
    return latest ?? null;
  }

  return prisma.redditAccount.create({
    data: {
      ownerUserId,
      username: cleanUsername,
      totalKarma: metrics.totalKarma ?? 0,
      linkKarma: metrics.linkKarma ?? 0,
      commentKarma: metrics.commentKarma ?? 0,
      awardeeKarma: metrics.awardeeKarma ?? 0,
      awarderKarma: metrics.awarderKarma ?? 0,
      followerCount: metrics.followerCount,
      over18: true,
    },
    select: {
      id: true,
      username: true,
      totalKarma: true,
      linkKarma: true,
      commentKarma: true,
      awardeeKarma: true,
      awarderKarma: true,
      followerCount: true,
    },
  });
}

function safeName(value: string | null | undefined): string | null {
  const clean = value?.trim();
  if (!clean) return null;
  return clean.slice(0, 240);
}

async function existingSnapshotId(ownerUserId: string, capturedAt: Date, sourceFileName: string | null): Promise<string | null> {
  if (!sourceFileName) return null;
  const rows = await prisma.$queryRaw<ExistingSnapshotRow[]>`
    SELECT "id"
    FROM "HistoricalSnapshot"
    WHERE "ownerUserId" = ${ownerUserId}
      AND "sourceFileName" = ${sourceFileName}
      AND "capturedAt" = ${capturedAt}
    LIMIT 1
  `;

  return rows[0]?.id ?? null;
}

async function upsertImportedAccountMetric(account: AccountRow | null, capturedAt: Date, metrics: ParsedProfileMetrics): Promise<boolean> {
  if (!account || !hasAnyProfileMetric(metrics)) return false;

  const source = "historical-profile-html";
  const totalKarma = metrics.totalKarma ?? account.totalKarma ?? 0;
  const linkKarma = metrics.linkKarma ?? account.linkKarma ?? 0;
  const commentKarma = metrics.commentKarma ?? account.commentKarma ?? 0;
  const awardeeKarma = metrics.awardeeKarma ?? account.awardeeKarma ?? 0;
  const awarderKarma = metrics.awarderKarma ?? account.awarderKarma ?? 0;
  const followerCount = positiveFollowerCount(metrics.followerCount) ?? positiveFollowerCount(account.followerCount);

  await prisma.accountMetricSnapshot.deleteMany({
    where: {
      accountId: account.id,
      source,
      capturedAt,
    },
  });

  await prisma.accountMetricSnapshot.create({
    data: {
      accountId: account.id,
      source,
      totalKarma,
      linkKarma,
      commentKarma,
      awardeeKarma,
      awarderKarma,
      followerCount,
      capturedAt,
    },
  });

  await prisma.redditAccount.update({
    where: { id: account.id },
    data: {
      ...(account.totalKarma === 0 && metrics.totalKarma !== null ? { totalKarma } : {}),
      ...(account.linkKarma === 0 && metrics.linkKarma !== null ? { linkKarma } : {}),
      ...(account.commentKarma === 0 && metrics.commentKarma !== null ? { commentKarma } : {}),
      ...(account.awardeeKarma === 0 && metrics.awardeeKarma !== null ? { awardeeKarma } : {}),
      ...(account.awarderKarma === 0 && metrics.awarderKarma !== null ? { awarderKarma } : {}),
      ...((account.followerCount === null || account.followerCount <= 0) && followerCount !== null ? { followerCount } : {}),
    },
  });

  return true;
}

async function insertPost(snapshotId: string, ownerUserId: string, accountId: string | null, observedAt: Date, post: ParsedHistoricalPost): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "HistoricalPostObservation" (
      "id", "snapshotId", "ownerUserId", "accountId", "redditId", "title", "subreddit", "permalink",
      "createdUtc", "score", "numComments", "upvoteRatio", "observedAt", "raw"
    ) VALUES (
      ${randomUUID()}, ${snapshotId}, ${ownerUserId}, ${accountId}, ${post.redditId}, ${post.title}, ${post.subreddit}, ${post.permalink},
      ${post.createdUtc}, ${post.score}, ${post.numComments}, ${post.upvoteRatio}, ${observedAt}, ${post.raw ?? {}}
    )
    ON CONFLICT ("snapshotId", "redditId") DO UPDATE SET
      "title" = EXCLUDED."title",
      "subreddit" = EXCLUDED."subreddit",
      "permalink" = EXCLUDED."permalink",
      "createdUtc" = EXCLUDED."createdUtc",
      "score" = EXCLUDED."score",
      "numComments" = EXCLUDED."numComments",
      "upvoteRatio" = EXCLUDED."upvoteRatio",
      "raw" = EXCLUDED."raw"
  `;
}

async function insertComment(snapshotId: string, ownerUserId: string, accountId: string | null, observedAt: Date, comment: ParsedHistoricalComment): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "HistoricalCommentObservation" (
      "id", "snapshotId", "ownerUserId", "accountId", "redditId", "body", "subreddit", "permalink",
      "createdUtc", "score", "linkTitle", "viewCount", "observedAt", "raw"
    ) VALUES (
      ${randomUUID()}, ${snapshotId}, ${ownerUserId}, ${accountId}, ${comment.redditId}, ${comment.body}, ${comment.subreddit}, ${comment.permalink},
      ${comment.createdUtc}, ${comment.score}, ${comment.linkTitle}, ${comment.viewCount}, ${observedAt}, ${comment.raw ?? {}}
    )
    ON CONFLICT ("snapshotId", "redditId") DO UPDATE SET
      "body" = EXCLUDED."body",
      "subreddit" = EXCLUDED."subreddit",
      "permalink" = EXCLUDED."permalink",
      "createdUtc" = EXCLUDED."createdUtc",
      "score" = EXCLUDED."score",
      "linkTitle" = EXCLUDED."linkTitle",
      "viewCount" = EXCLUDED."viewCount",
      "raw" = EXCLUDED."raw"
  `;
}

export async function importHistoricalSnapshot(input: SnapshotImportInput): Promise<SnapshotImportResult> {
  await cleanupZeroFollowerCounts(input.ownerUserId);

  const parsed = parseHistoricalSnapshotContent(input.content);
  const username = parsed.username ?? input.username?.trim() ?? null;
  const profileMetrics = normaliseProfileMetrics(parsed.profileMetrics, username, input.content);

  if (parsed.posts.length === 0 && parsed.comments.length === 0 && !hasAnyProfileMetric(profileMetrics)) {
    throw new Error("No Reddit posts, comments, karma, or followers were found in that snapshot.");
  }

  const account = await findOrCreateAccount(input.ownerUserId, username, profileMetrics);
  const accountId = account?.id ?? null;
  const sourceFileName = safeName(input.sourceFileName);
  const snapshotId = (await existingSnapshotId(input.ownerUserId, input.capturedAt, sourceFileName)) ?? randomUUID();
  const accountMetricImported = await upsertImportedAccountMetric(account, input.capturedAt, profileMetrics);
  const metadata = metadataWithImportContent(parsed.metadata, input.content, profileMetrics);

  await prisma.$executeRaw`
    INSERT INTO "HistoricalSnapshot" (
      "id", "ownerUserId", "accountId", "source", "sourceFileName", "capturedAt", "postCount", "commentCount", "metadata"
    ) VALUES (
      ${snapshotId}, ${input.ownerUserId}, ${accountId}, ${parsed.source}, ${sourceFileName}, ${input.capturedAt}, ${parsed.posts.length}, ${parsed.comments.length}, ${metadata}
    )
    ON CONFLICT ("id") DO UPDATE SET
      "accountId" = EXCLUDED."accountId",
      "source" = EXCLUDED."source",
      "sourceFileName" = EXCLUDED."sourceFileName",
      "postCount" = EXCLUDED."postCount",
      "commentCount" = EXCLUDED."commentCount",
      "metadata" = EXCLUDED."metadata",
      "importedAt" = CURRENT_TIMESTAMP
  `;

  await prisma.$executeRaw`DELETE FROM "HistoricalPostObservation" WHERE "snapshotId" = ${snapshotId}`;
  await prisma.$executeRaw`DELETE FROM "HistoricalCommentObservation" WHERE "snapshotId" = ${snapshotId}`;

  for (const post of parsed.posts) {
    await insertPost(snapshotId, input.ownerUserId, accountId, input.capturedAt, post);
  }

  for (const comment of parsed.comments) {
    await insertComment(snapshotId, input.ownerUserId, accountId, input.capturedAt, comment);
  }

  return {
    snapshotId,
    capturedAt: input.capturedAt.toISOString(),
    source: parsed.source,
    sourceFileName,
    postCount: parsed.posts.length,
    commentCount: parsed.comments.length,
    username,
    accountMetricImported,
    profileMetrics,
  };
}

export async function reparseHistoricalSnapshotFollowers(ownerUserId: string): Promise<ReparseFollowerResult> {
  const cleanup = await cleanupZeroFollowerCounts(ownerUserId);
  const rows = await prisma.$queryRaw<SnapshotForReparseRow[]>`
    SELECT "id", "accountId", "capturedAt", "metadata"
    FROM "HistoricalSnapshot"
    WHERE "ownerUserId" = ${ownerUserId}
    ORDER BY "capturedAt" ASC
  `;

  let snapshotsReparsed = 0;
  let followerSnapshotsImported = 0;
  let skippedWithoutStoredContent = 0;
  let skippedWithoutFollowers = 0;

  for (const row of rows) {
    const rawContent = storedRawContent(row.metadata);
    let metrics: ParsedProfileMetrics | null = null;

    if (rawContent) {
      snapshotsReparsed += 1;
      const parsed = parseHistoricalSnapshotContent(rawContent);
      metrics = normaliseProfileMetrics(parsed.profileMetrics, parsed.username, rawContent);
      const metadata = metadataWithImportContent(parsed.metadata, rawContent, metrics);
      await prisma.$executeRaw`
        UPDATE "HistoricalSnapshot"
        SET "metadata" = ${metadata}, "importedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${row.id}
      `;
    } else {
      metrics = profileMetricsFromMetadata(row.metadata);
      if (!metrics) skippedWithoutStoredContent += 1;
    }

    if (!metrics?.followerCount) {
      skippedWithoutFollowers += 1;
      continue;
    }

    const account = row.accountId ? await accountById(row.accountId) : await findOrCreateAccount(ownerUserId, metrics.username, metrics);
    if (!account) continue;

    await upsertImportedAccountMetric(account, row.capturedAt, metrics);
    followerSnapshotsImported += 1;
  }

  return {
    snapshotsChecked: rows.length,
    snapshotsReparsed,
    followerSnapshotsImported,
    skippedWithoutStoredContent,
    skippedWithoutFollowers,
    ...cleanup,
  };
}

export async function listHistoricalSnapshots(ownerUserId: string): Promise<HistoricalSnapshotSummary[]> {
  const rows = await prisma.$queryRaw<SnapshotRow[]>`
    SELECT "id", "capturedAt", "importedAt", "source", "sourceFileName", "postCount", "commentCount"
    FROM "HistoricalSnapshot"
    WHERE "ownerUserId" = ${ownerUserId}
    ORDER BY "capturedAt" DESC
    LIMIT 20
  `;

  return rows.map((row) => ({
    id: row.id,
    capturedAt: row.capturedAt.toISOString(),
    importedAt: row.importedAt.toISOString(),
    source: row.source,
    sourceFileName: row.sourceFileName,
    postCount: row.postCount,
    commentCount: row.commentCount,
  }));
}
