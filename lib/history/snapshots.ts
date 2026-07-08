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

function hasAnyProfileMetric(metrics: ParsedProfileMetrics): boolean {
  return metrics.totalKarma !== null || metrics.linkKarma !== null || metrics.commentKarma !== null || metrics.awardeeKarma !== null || metrics.awarderKarma !== null || metrics.followerCount !== null;
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
    if (existing.followerCount === null && metrics.followerCount !== null) update.followerCount = metrics.followerCount;

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
  const followerCount = metrics.followerCount ?? account.followerCount ?? null;

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
      ...(account.followerCount === null && metrics.followerCount !== null ? { followerCount } : {}),
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
  const parsed = parseHistoricalSnapshotContent(input.content);
  const username = parsed.username ?? input.username?.trim() ?? null;
  const profileMetrics: ParsedProfileMetrics = { ...parsed.profileMetrics, username };

  if (parsed.posts.length === 0 && parsed.comments.length === 0 && !hasAnyProfileMetric(profileMetrics)) {
    throw new Error("No Reddit posts, comments, karma, or followers were found in that snapshot.");
  }

  const account = await findOrCreateAccount(input.ownerUserId, username, profileMetrics);
  const accountId = account?.id ?? null;
  const sourceFileName = safeName(input.sourceFileName);
  const snapshotId = (await existingSnapshotId(input.ownerUserId, input.capturedAt, sourceFileName)) ?? randomUUID();
  const accountMetricImported = await upsertImportedAccountMetric(account, input.capturedAt, profileMetrics);

  await prisma.$executeRaw`
    INSERT INTO "HistoricalSnapshot" (
      "id", "ownerUserId", "accountId", "source", "sourceFileName", "capturedAt", "postCount", "commentCount", "metadata"
    ) VALUES (
      ${snapshotId}, ${input.ownerUserId}, ${accountId}, ${parsed.source}, ${sourceFileName}, ${input.capturedAt}, ${parsed.posts.length}, ${parsed.comments.length}, ${parsed.metadata}
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
