import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { parseHistoricalSnapshotContent, type ParsedHistoricalComment, type ParsedHistoricalPost } from "./snapshot-parser";

type SnapshotImportInput = {
  ownerUserId: string;
  capturedAt: Date;
  content: string;
  sourceFileName?: string | null;
};

export type SnapshotImportResult = {
  snapshotId: string;
  capturedAt: string;
  source: string;
  sourceFileName: string | null;
  postCount: number;
  commentCount: number;
  username: string | null;
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

async function findAccountId(ownerUserId: string, username: string | null): Promise<string | null> {
  const account = await prisma.redditAccount.findFirst({
    where: {
      ownerUserId,
      ...(username ? { username } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (account) return account.id;

  const latest = await prisma.redditAccount.findFirst({
    where: { ownerUserId },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  return latest?.id ?? null;
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

  if (parsed.posts.length === 0 && parsed.comments.length === 0) {
    throw new Error("No Reddit posts or comments were found in that snapshot.");
  }

  const accountId = await findAccountId(input.ownerUserId, parsed.username);
  const sourceFileName = safeName(input.sourceFileName);
  const snapshotId = (await existingSnapshotId(input.ownerUserId, input.capturedAt, sourceFileName)) ?? randomUUID();

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
    username: parsed.username,
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
