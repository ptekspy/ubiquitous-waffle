import { randomUUID } from "crypto";

import { prisma } from "@/lib/db/prisma";

export type IdleCrawlerTargetKind = "SUBREDDIT_FEED" | "HOME_FEED" | "USER_PROFILE";

export type IdleCrawlerTarget = {
  id: string;
  kind: IdleCrawlerTargetKind;
  label: string;
  subreddit: string | null;
  username: string | null;
  feed: string;
  forced: boolean;
};

export type IdleCrawlerSummary = {
  generatedAt: string;
  counts: {
    targets: number;
    dueTargets: number;
    collectedUsers: number;
    posts: number;
    comments: number;
  };
  targets: Array<{
    id: string;
    kind: string;
    label: string;
    subreddit: string | null;
    username: string | null;
    feed: string;
    priority: number;
    enabled: boolean;
    lastCompletedAt: string | null;
    nextDueAt: string | null;
    lastStatus: string | null;
    lastError: string | null;
    lastPostCount: number;
    lastCommentCount: number;
  }>;
  posts: Array<{
    id: string;
    redditId: string;
    title: string;
    subreddit: string;
    author: string | null;
    permalink: string;
    feed: string;
    score: number;
    numComments: number;
    lastSeenAt: string;
  }>;
  users: Array<{
    id: string;
    username: string;
    source: string | null;
    postMentions: number;
    commentMentions: number;
    latestScore: number | null;
    latestFollowers: number | null;
    lastSeenAt: string;
    lastProfileCrawledAt: string | null;
    nextProfileCrawlAt: string | null;
  }>;
};

type TargetRow = {
  id: string;
  kind: IdleCrawlerTargetKind;
  label: string;
  subreddit: string | null;
  username: string | null;
  feed: string;
};

type TargetSeed = {
  kind: IdleCrawlerTargetKind;
  label: string;
  subreddit?: string | null;
  username?: string | null;
  feed: string;
  priority: number;
  intervalMs: number;
};

type RawTargetSummaryRow = {
  id: string;
  kind: string;
  label: string;
  subreddit: string | null;
  username: string | null;
  feed: string;
  priority: number;
  enabled: boolean;
  lastCompletedAt: Date | null;
  nextDueAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  lastPostCount: number;
  lastCommentCount: number;
};

type RawPostRow = {
  id: string;
  redditId: string;
  title: string;
  subreddit: string;
  author: string | null;
  permalink: string;
  feed: string;
  score: number;
  numComments: number;
  lastSeenAt: Date;
};

type RawUserRow = {
  id: string;
  username: string;
  source: string | null;
  postMentions: number;
  commentMentions: number;
  latestScore: number | null;
  latestFollowers: number | null;
  lastSeenAt: Date;
  lastProfileCrawledAt: Date | null;
  nextProfileCrawlAt: Date | null;
};

type PayloadPost = {
  id: string;
  title: string;
  subreddit: string;
  author: string | null;
  permalink: string;
  url: string | null;
  createdUtc: number;
  score: number;
  numComments: number;
  upvoteRatio: number | null;
  over18: boolean;
};

type PayloadComment = {
  id: string;
  postRedditId: string | null;
  author: string | null;
  body: string;
  subreddit: string;
  permalink: string | null;
  createdUtc: number;
  score: number;
};

const STALE_LOCK_MS = 30 * 60 * 1000;
const SUBREDDIT_NEW_INTERVAL_MS = 60 * 60 * 1000;
const SUBREDDIT_BEST_INTERVAL_MS = 6 * 60 * 60 * 1000;
const SUBREDDIT_TOP_INTERVAL_MS = 12 * 60 * 60 * 1000;
const USER_PROFILE_INTERVAL_MS = 24 * 60 * 60 * 1000;

const HOME_TARGETS: TargetSeed[] = [
  { kind: "HOME_FEED", label: "Home /new", feed: "new", priority: 60, intervalMs: 45 * 60 * 1000 },
  { kind: "HOME_FEED", label: "Home /best", feed: "best", priority: 65, intervalMs: 2 * 60 * 60 * 1000 },
  { kind: "HOME_FEED", label: "Home /hot", feed: "hot", priority: 70, intervalMs: 3 * 60 * 60 * 1000 },
  { kind: "HOME_FEED", label: "Home /rising", feed: "rising", priority: 75, intervalMs: 3 * 60 * 60 * 1000 },
  { kind: "HOME_FEED", label: "Home /top day", feed: "top:day", priority: 80, intervalMs: 4 * 60 * 60 * 1000 },
  { kind: "HOME_FEED", label: "Home /top week", feed: "top:week", priority: 85, intervalMs: 8 * 60 * 60 * 1000 },
  { kind: "HOME_FEED", label: "Home /top month", feed: "top:month", priority: 90, intervalMs: 12 * 60 * 60 * 1000 },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  const text = asString(value).trim();
  return text.length > 0 ? text : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normaliseSubreddit(value: unknown): string {
  return asString(value).trim().replace(/^r\//i, "").toLowerCase();
}

function normaliseUsername(value: unknown): string {
  const username = asString(value).trim().replace(/^u\//i, "").replace(/^@/, "");
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(username)) return "";
  const lower = username.toLowerCase();
  if (lower === "deleted" || lower === "automoderator" || lower === "reddit") return "";
  return username;
}

function thingId(value: unknown, prefix: "t1" | "t3"): string {
  const raw = asString(value).trim();
  if (!raw) return "";
  return raw.startsWith(`${prefix}_`) ? raw : `${prefix}_${raw.replace(/^t[13]_/, "")}`;
}

function targetDedupeKey(seed: TargetSeed): string {
  if (seed.kind === "SUBREDDIT_FEED") return `subreddit:${normaliseSubreddit(seed.subreddit)}:${seed.feed}`;
  if (seed.kind === "USER_PROFILE") return `user:${normaliseUsername(seed.username).toLowerCase()}`;
  return `home:${seed.feed}`;
}

function labelForSubredditFeed(subreddit: string, feed: string): string {
  return `r/${subreddit} /${feed.replace(":", " ")}`;
}

function dateOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

async function executeStatements(statements: string[]): Promise<void> {
  for (const statement of statements) await prisma.$executeRawUnsafe(statement);
}

export async function ensureIdleCrawlerTables(): Promise<void> {
  await executeStatements([
    `CREATE TABLE IF NOT EXISTS "IdleCrawlTarget" (
      "id" TEXT NOT NULL,
      "ownerUserId" TEXT NOT NULL,
      "dedupeKey" TEXT NOT NULL,
      "kind" TEXT NOT NULL,
      "label" TEXT NOT NULL,
      "subreddit" TEXT,
      "username" TEXT,
      "feed" TEXT NOT NULL,
      "priority" INTEGER NOT NULL DEFAULT 100,
      "intervalMs" INTEGER NOT NULL,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "lockedAt" TIMESTAMP(3),
      "lastStartedAt" TIMESTAMP(3),
      "lastCompletedAt" TIMESTAMP(3),
      "nextDueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastStatus" TEXT,
      "lastError" TEXT,
      "lastPostCount" INTEGER NOT NULL DEFAULT 0,
      "lastCommentCount" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "IdleCrawlTarget_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE TABLE IF NOT EXISTS "CollectedRedditUser" (
      "id" TEXT NOT NULL,
      "ownerUserId" TEXT NOT NULL,
      "username" TEXT NOT NULL,
      "source" TEXT,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "postMentions" INTEGER NOT NULL DEFAULT 0,
      "commentMentions" INTEGER NOT NULL DEFAULT 0,
      "latestScore" INTEGER,
      "latestFollowers" INTEGER,
      "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastProfileCrawledAt" TIMESTAMP(3),
      "nextProfileCrawlAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CollectedRedditUser_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE TABLE IF NOT EXISTS "CrawledPost" (
      "id" TEXT NOT NULL,
      "ownerUserId" TEXT NOT NULL,
      "targetId" TEXT,
      "redditId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "subreddit" TEXT NOT NULL,
      "author" TEXT,
      "permalink" TEXT NOT NULL,
      "url" TEXT,
      "feed" TEXT NOT NULL,
      "source" TEXT NOT NULL,
      "createdUtc" INTEGER NOT NULL,
      "score" INTEGER NOT NULL DEFAULT 0,
      "numComments" INTEGER NOT NULL DEFAULT 0,
      "upvoteRatio" DOUBLE PRECISION,
      "over18" BOOLEAN NOT NULL DEFAULT false,
      "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CrawledPost_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE TABLE IF NOT EXISTS "CrawledComment" (
      "id" TEXT NOT NULL,
      "ownerUserId" TEXT NOT NULL,
      "targetId" TEXT,
      "redditId" TEXT NOT NULL,
      "postRedditId" TEXT,
      "author" TEXT,
      "body" TEXT NOT NULL,
      "subreddit" TEXT NOT NULL,
      "permalink" TEXT,
      "feed" TEXT NOT NULL,
      "source" TEXT NOT NULL,
      "createdUtc" INTEGER NOT NULL,
      "score" INTEGER NOT NULL DEFAULT 0,
      "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CrawledComment_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "IdleCrawlTarget_ownerUserId_dedupeKey_key" ON "IdleCrawlTarget"("ownerUserId", "dedupeKey")`,
    `CREATE INDEX IF NOT EXISTS "IdleCrawlTarget_ownerUserId_enabled_nextDueAt_idx" ON "IdleCrawlTarget"("ownerUserId", "enabled", "nextDueAt")`,
    `CREATE INDEX IF NOT EXISTS "IdleCrawlTarget_ownerUserId_kind_idx" ON "IdleCrawlTarget"("ownerUserId", "kind")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "CollectedRedditUser_ownerUserId_username_key" ON "CollectedRedditUser"("ownerUserId", "username")`,
    `CREATE INDEX IF NOT EXISTS "CollectedRedditUser_ownerUserId_enabled_nextProfileCrawlAt_idx" ON "CollectedRedditUser"("ownerUserId", "enabled", "nextProfileCrawlAt")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "CrawledPost_ownerUserId_redditId_key" ON "CrawledPost"("ownerUserId", "redditId")`,
    `CREATE INDEX IF NOT EXISTS "CrawledPost_ownerUserId_lastSeenAt_idx" ON "CrawledPost"("ownerUserId", "lastSeenAt")`,
    `CREATE INDEX IF NOT EXISTS "CrawledPost_ownerUserId_subreddit_lastSeenAt_idx" ON "CrawledPost"("ownerUserId", "subreddit", "lastSeenAt")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "CrawledComment_ownerUserId_redditId_key" ON "CrawledComment"("ownerUserId", "redditId")`,
    `CREATE INDEX IF NOT EXISTS "CrawledComment_ownerUserId_lastSeenAt_idx" ON "CrawledComment"("ownerUserId", "lastSeenAt")`,
  ]);
}

async function upsertTarget(ownerUserId: string, seed: TargetSeed): Promise<void> {
  const dedupeKey = targetDedupeKey(seed);
  if (!dedupeKey.includes(":")) return;

  await prisma.$executeRaw`
    INSERT INTO "IdleCrawlTarget" ("id", "ownerUserId", "dedupeKey", "kind", "label", "subreddit", "username", "feed", "priority", "intervalMs", "enabled", "nextDueAt", "updatedAt")
    VALUES (${randomUUID()}, ${ownerUserId}, ${dedupeKey}, ${seed.kind}, ${seed.label}, ${seed.subreddit ?? null}, ${seed.username ?? null}, ${seed.feed}, ${seed.priority}, ${seed.intervalMs}, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("ownerUserId", "dedupeKey") DO UPDATE SET
      "label" = EXCLUDED."label",
      "priority" = EXCLUDED."priority",
      "intervalMs" = EXCLUDED."intervalMs",
      "enabled" = true,
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}

async function seedSubredditTargets(ownerUserId: string): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ subreddit: string | null }>>`
    SELECT DISTINCT "subreddit" FROM "TrackedSubreddit" WHERE "ownerUserId" = ${ownerUserId} AND "enabled" = true
    UNION
    SELECT DISTINCT ss."subreddit" FROM "SubredditSnapshot" ss JOIN "Account" a ON a."id" = ss."accountId" WHERE a."ownerUserId" = ${ownerUserId}
    UNION
    SELECT DISTINCT ps."subreddit" FROM "PostSnapshot" ps JOIN "Account" a ON a."id" = ps."accountId" WHERE a."ownerUserId" = ${ownerUserId}
    UNION
    SELECT DISTINCT cp."subreddit" FROM "CrawledPost" cp WHERE cp."ownerUserId" = ${ownerUserId}
  `;

  const subreddits = new Set<string>(["daresgonewild"]);
  for (const row of rows) {
    const subreddit = normaliseSubreddit(row.subreddit);
    if (subreddit) subreddits.add(subreddit);
  }

  for (const subreddit of subreddits) {
    await upsertTarget(ownerUserId, { kind: "SUBREDDIT_FEED", label: labelForSubredditFeed(subreddit, "new"), subreddit, feed: "new", priority: 20, intervalMs: SUBREDDIT_NEW_INTERVAL_MS });
    await upsertTarget(ownerUserId, { kind: "SUBREDDIT_FEED", label: labelForSubredditFeed(subreddit, "best"), subreddit, feed: "best", priority: 30, intervalMs: SUBREDDIT_BEST_INTERVAL_MS });
    await upsertTarget(ownerUserId, { kind: "SUBREDDIT_FEED", label: labelForSubredditFeed(subreddit, "top:day"), subreddit, feed: "top:day", priority: 35, intervalMs: SUBREDDIT_TOP_INTERVAL_MS });
  }
}

async function upsertCollectedUser(ownerUserId: string, usernameValue: unknown, source: string, counter: "post" | "comment" = "post", score: number | null = null, followers: number | null = null): Promise<void> {
  const username = normaliseUsername(usernameValue);
  if (!username) return;

  await prisma.$executeRaw`
    INSERT INTO "CollectedRedditUser" ("id", "ownerUserId", "username", "source", "postMentions", "commentMentions", "latestScore", "latestFollowers", "lastSeenAt", "updatedAt")
    VALUES (${randomUUID()}, ${ownerUserId}, ${username}, ${source}, ${counter === "post" ? 1 : 0}, ${counter === "comment" ? 1 : 0}, ${score}, ${followers}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("ownerUserId", "username") DO UPDATE SET
      "source" = COALESCE("CollectedRedditUser"."source", EXCLUDED."source"),
      "postMentions" = "CollectedRedditUser"."postMentions" + EXCLUDED."postMentions",
      "commentMentions" = "CollectedRedditUser"."commentMentions" + EXCLUDED."commentMentions",
      "latestScore" = COALESCE(EXCLUDED."latestScore", "CollectedRedditUser"."latestScore"),
      "latestFollowers" = COALESCE(EXCLUDED."latestFollowers", "CollectedRedditUser"."latestFollowers"),
      "lastSeenAt" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}

async function seedCollectedUsers(ownerUserId: string): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ username: string | null; source: string }>>`
    SELECT DISTINCT ptc."author" AS username, 'thread_comment' AS source
      FROM "PostThreadComment" ptc
      JOIN "PostSnapshot" ps ON ps."id" = ptc."postSnapshotId"
      JOIN "Account" a ON a."id" = ps."accountId"
     WHERE a."ownerUserId" = ${ownerUserId} AND ptc."author" IS NOT NULL
    UNION
    SELECT DISTINCT "username", 'tracked_peer' AS source
      FROM "TrackedPeerAccount"
     WHERE "ownerUserId" = ${ownerUserId} AND "enabled" = true
    UNION
    SELECT DISTINCT "author" AS username, 'crawled_post' AS source
      FROM "CrawledPost"
     WHERE "ownerUserId" = ${ownerUserId} AND "author" IS NOT NULL
    UNION
    SELECT DISTINCT "author" AS username, 'crawled_comment' AS source
      FROM "CrawledComment"
     WHERE "ownerUserId" = ${ownerUserId} AND "author" IS NOT NULL
  `;

  const owner = await prisma.user.findUnique({ where: { id: ownerUserId }, select: { redditUsername: true } });
  const ownerUsername = normaliseUsername(owner?.redditUsername).toLowerCase();

  for (const row of rows) {
    const username = normaliseUsername(row.username);
    if (!username || username.toLowerCase() === ownerUsername) continue;
    await upsertCollectedUser(ownerUserId, username, row.source);
  }
}

async function seedUserTargets(ownerUserId: string): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ username: string }>>`
    SELECT "username" FROM "CollectedRedditUser"
     WHERE "ownerUserId" = ${ownerUserId} AND "enabled" = true
     ORDER BY "nextProfileCrawlAt" ASC, "lastSeenAt" DESC
     LIMIT 500
  `;

  for (const row of rows) {
    const username = normaliseUsername(row.username);
    if (!username) continue;
    await upsertTarget(ownerUserId, { kind: "USER_PROFILE", label: `u/${username}`, username, feed: "submitted+comments", priority: 120, intervalMs: USER_PROFILE_INTERVAL_MS });
  }
}

export async function seedIdleCrawlerTargets(ownerUserId: string): Promise<void> {
  await ensureIdleCrawlerTables();
  for (const target of HOME_TARGETS) await upsertTarget(ownerUserId, target);
  await seedSubredditTargets(ownerUserId);
  await seedCollectedUsers(ownerUserId);
  await seedUserTargets(ownerUserId);
}

export async function claimIdleCrawlerTarget(ownerUserId: string): Promise<IdleCrawlerTarget | null> {
  await seedIdleCrawlerTargets(ownerUserId);

  const staleLockCutoff = new Date(Date.now() - STALE_LOCK_MS);
  await prisma.$executeRaw`
    UPDATE "IdleCrawlTarget"
       SET "lockedAt" = NULL, "lastStatus" = 'STALE_LOCK_RELEASED', "updatedAt" = CURRENT_TIMESTAMP
     WHERE "ownerUserId" = ${ownerUserId} AND "lockedAt" IS NOT NULL AND "lockedAt" <= ${staleLockCutoff}
  `;

  const dueRows = await prisma.$queryRaw<TargetRow[]>`
    SELECT "id", "kind", "label", "subreddit", "username", "feed"
      FROM "IdleCrawlTarget"
     WHERE "ownerUserId" = ${ownerUserId}
       AND "enabled" = true
       AND "lockedAt" IS NULL
       AND "nextDueAt" <= CURRENT_TIMESTAMP
     ORDER BY "priority" ASC, "nextDueAt" ASC, COALESCE("lastCompletedAt", "createdAt") ASC
     LIMIT 1
  `;

  const due = dueRows[0];
  const forced = false;
  const fallbackRows = due
    ? []
    : await prisma.$queryRaw<TargetRow[]>`
        SELECT "id", "kind", "label", "subreddit", "username", "feed"
          FROM "IdleCrawlTarget"
         WHERE "ownerUserId" = ${ownerUserId}
           AND "enabled" = true
           AND "lockedAt" IS NULL
           AND "kind" = 'HOME_FEED'
         ORDER BY COALESCE("lastCompletedAt", "createdAt") ASC, "priority" ASC
         LIMIT 1
      `;

  const target = due ?? fallbackRows[0];
  if (!target) return null;

  await prisma.$executeRaw`
    UPDATE "IdleCrawlTarget"
       SET "lockedAt" = CURRENT_TIMESTAMP, "lastStartedAt" = CURRENT_TIMESTAMP, "lastStatus" = 'RUNNING', "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = ${target.id} AND "ownerUserId" = ${ownerUserId}
  `;

  return { ...target, forced: !due };
}

function parsePost(value: unknown, fallbackAuthor: string | null): PayloadPost | null {
  if (!isRecord(value)) return null;
  const id = thingId(value.id, "t3");
  const title = asString(value.title).trim();
  const subreddit = normaliseSubreddit(value.subreddit);
  const permalink = asString(value.permalink).trim();
  if (!id || !title || !subreddit || !permalink) return null;

  return {
    id,
    title,
    subreddit,
    author: normaliseUsername(value.author) || fallbackAuthor,
    permalink,
    url: asNullableString(value.url),
    createdUtc: asNumber(value.createdUtc, Math.floor(Date.now() / 1000)),
    score: asNumber(value.score),
    numComments: asNumber(value.numComments),
    upvoteRatio: asNullableNumber(value.upvoteRatio),
    over18: Boolean(value.over18),
  };
}

function parseComment(value: unknown, fallbackAuthor: string | null): PayloadComment | null {
  if (!isRecord(value)) return null;
  const id = thingId(value.id ?? value.redditId, "t1");
  const body = asString(value.body).trim();
  const subreddit = normaliseSubreddit(value.subreddit);
  if (!id || !body || !subreddit) return null;

  return {
    id,
    postRedditId: asNullableString(value.postRedditId),
    author: normaliseUsername(value.author) || fallbackAuthor,
    body,
    subreddit,
    permalink: asNullableString(value.permalink),
    createdUtc: asNumber(value.createdUtc, Math.floor(Date.now() / 1000)),
    score: asNumber(value.score),
  };
}

async function loadTarget(ownerUserId: string, targetId: string): Promise<(TargetRow & { intervalMs: number }) | null> {
  const rows = await prisma.$queryRaw<Array<TargetRow & { intervalMs: number }>>`
    SELECT "id", "kind", "label", "subreddit", "username", "feed", "intervalMs"
      FROM "IdleCrawlTarget"
     WHERE "id" = ${targetId} AND "ownerUserId" = ${ownerUserId}
     LIMIT 1
  `;
  return rows[0] ?? null;
}

async function upsertPost(ownerUserId: string, targetId: string, target: TargetRow, source: string, post: PayloadPost): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "CrawledPost" ("id", "ownerUserId", "targetId", "redditId", "title", "subreddit", "author", "permalink", "url", "feed", "source", "createdUtc", "score", "numComments", "upvoteRatio", "over18", "lastSeenAt", "updatedAt")
    VALUES (${randomUUID()}, ${ownerUserId}, ${targetId}, ${post.id}, ${post.title}, ${post.subreddit}, ${post.author}, ${post.permalink}, ${post.url}, ${target.feed}, ${source}, ${post.createdUtc}, ${post.score}, ${post.numComments}, ${post.upvoteRatio}, ${post.over18}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("ownerUserId", "redditId") DO UPDATE SET
      "targetId" = EXCLUDED."targetId",
      "title" = EXCLUDED."title",
      "subreddit" = EXCLUDED."subreddit",
      "author" = COALESCE(EXCLUDED."author", "CrawledPost"."author"),
      "permalink" = EXCLUDED."permalink",
      "url" = EXCLUDED."url",
      "feed" = EXCLUDED."feed",
      "source" = EXCLUDED."source",
      "score" = EXCLUDED."score",
      "numComments" = EXCLUDED."numComments",
      "upvoteRatio" = EXCLUDED."upvoteRatio",
      "over18" = EXCLUDED."over18",
      "lastSeenAt" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP
  `;

  await upsertCollectedUser(ownerUserId, post.author, `post:${target.label}`, "post", post.score, null);
}

async function upsertComment(ownerUserId: string, targetId: string, target: TargetRow, source: string, comment: PayloadComment): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "CrawledComment" ("id", "ownerUserId", "targetId", "redditId", "postRedditId", "author", "body", "subreddit", "permalink", "feed", "source", "createdUtc", "score", "lastSeenAt", "updatedAt")
    VALUES (${randomUUID()}, ${ownerUserId}, ${targetId}, ${comment.id}, ${comment.postRedditId}, ${comment.author}, ${comment.body}, ${comment.subreddit}, ${comment.permalink}, ${target.feed}, ${source}, ${comment.createdUtc}, ${comment.score}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("ownerUserId", "redditId") DO UPDATE SET
      "targetId" = EXCLUDED."targetId",
      "postRedditId" = EXCLUDED."postRedditId",
      "author" = COALESCE(EXCLUDED."author", "CrawledComment"."author"),
      "body" = EXCLUDED."body",
      "subreddit" = EXCLUDED."subreddit",
      "permalink" = EXCLUDED."permalink",
      "feed" = EXCLUDED."feed",
      "source" = EXCLUDED."source",
      "score" = EXCLUDED."score",
      "lastSeenAt" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP
  `;

  await upsertCollectedUser(ownerUserId, comment.author, `comment:${target.label}`, "comment", comment.score, null);
}

export async function saveIdleCrawlerFailure(ownerUserId: string, targetId: string, error: string): Promise<void> {
  await ensureIdleCrawlerTables();
  const target = await loadTarget(ownerUserId, targetId);
  if (!target) throw new Error("Idle crawler target not found.");
  const nextDueAt = new Date(Date.now() + Math.max(5 * 60 * 1000, Math.floor(target.intervalMs / 4)));

  await prisma.$executeRaw`
    UPDATE "IdleCrawlTarget"
       SET "lockedAt" = NULL, "lastStatus" = 'FAILED', "lastError" = ${error.slice(0, 1000)}, "nextDueAt" = ${nextDueAt}, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = ${targetId} AND "ownerUserId" = ${ownerUserId}
  `;
}

export async function saveIdleCrawlerPayload(ownerUserId: string, targetId: string, payload: unknown): Promise<{ posts: number; comments: number; users: number }> {
  await ensureIdleCrawlerTables();
  const target = await loadTarget(ownerUserId, targetId);
  if (!target) throw new Error("Idle crawler target not found.");
  if (!isRecord(payload)) throw new Error("Invalid idle crawler payload.");

  const profile = isRecord(payload.profile) ? payload.profile : null;
  const fallbackAuthor = normaliseUsername(profile?.username) || normaliseUsername(target.username) || null;
  const posts = Array.isArray(payload.posts) ? payload.posts.map((post) => parsePost(post, fallbackAuthor)).filter((post): post is PayloadPost => Boolean(post)) : [];
  const comments = Array.isArray(payload.comments) ? payload.comments.map((comment) => parseComment(comment, fallbackAuthor)).filter((comment): comment is PayloadComment => Boolean(comment)) : [];
  const source = asString(payload.source) || "paidpolitely-idle-crawler";
  const seenUsers = new Set<string>();

  for (const post of posts) {
    await upsertPost(ownerUserId, targetId, target, source, post);
    if (post.author) seenUsers.add(post.author.toLowerCase());
  }

  for (const comment of comments) {
    await upsertComment(ownerUserId, targetId, target, source, comment);
    if (comment.author) seenUsers.add(comment.author.toLowerCase());
  }

  if (profile) {
    const username = normaliseUsername(profile.username);
    if (username) {
      const latestScore = asNumber(profile.totalKarma, 0);
      const latestFollowers = asNullableNumber(profile.followerCount);
      await upsertCollectedUser(ownerUserId, username, `profile:${target.label}`, "post", latestScore, latestFollowers);
      await prisma.$executeRaw`
        UPDATE "CollectedRedditUser"
           SET "lastProfileCrawledAt" = CURRENT_TIMESTAMP, "nextProfileCrawlAt" = ${new Date(Date.now() + USER_PROFILE_INTERVAL_MS)}, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "ownerUserId" = ${ownerUserId} AND "username" = ${username}
      `;
      seenUsers.add(username.toLowerCase());
    }
  }

  const nextDueAt = new Date(Date.now() + target.intervalMs);
  await prisma.$executeRaw`
    UPDATE "IdleCrawlTarget"
       SET "lockedAt" = NULL,
           "lastCompletedAt" = CURRENT_TIMESTAMP,
           "nextDueAt" = ${nextDueAt},
           "lastStatus" = 'COMPLETED',
           "lastError" = NULL,
           "lastPostCount" = ${posts.length},
           "lastCommentCount" = ${comments.length},
           "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = ${targetId} AND "ownerUserId" = ${ownerUserId}
  `;

  return { posts: posts.length, comments: comments.length, users: seenUsers.size };
}

export async function getIdleCrawlerSummary(ownerUserId: string): Promise<IdleCrawlerSummary> {
  await seedIdleCrawlerTargets(ownerUserId);

  const [targetCount] = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "IdleCrawlTarget" WHERE "ownerUserId" = ${ownerUserId}`;
  const [dueCount] = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "IdleCrawlTarget" WHERE "ownerUserId" = ${ownerUserId} AND "enabled" = true AND "nextDueAt" <= CURRENT_TIMESTAMP`;
  const [userCount] = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "CollectedRedditUser" WHERE "ownerUserId" = ${ownerUserId}`;
  const [postCount] = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "CrawledPost" WHERE "ownerUserId" = ${ownerUserId}`;
  const [commentCount] = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "CrawledComment" WHERE "ownerUserId" = ${ownerUserId}`;

  const targets = await prisma.$queryRaw<RawTargetSummaryRow[]>`
    SELECT "id", "kind", "label", "subreddit", "username", "feed", "priority", "enabled", "lastCompletedAt", "nextDueAt", "lastStatus", "lastError", "lastPostCount", "lastCommentCount"
      FROM "IdleCrawlTarget"
     WHERE "ownerUserId" = ${ownerUserId}
     ORDER BY "priority" ASC, "nextDueAt" ASC
     LIMIT 80
  `;

  const posts = await prisma.$queryRaw<RawPostRow[]>`
    SELECT "id", "redditId", "title", "subreddit", "author", "permalink", "feed", "score", "numComments", "lastSeenAt"
      FROM "CrawledPost"
     WHERE "ownerUserId" = ${ownerUserId}
     ORDER BY "lastSeenAt" DESC
     LIMIT 100
  `;

  const users = await prisma.$queryRaw<RawUserRow[]>`
    SELECT "id", "username", "source", "postMentions", "commentMentions", "latestScore", "latestFollowers", "lastSeenAt", "lastProfileCrawledAt", "nextProfileCrawlAt"
      FROM "CollectedRedditUser"
     WHERE "ownerUserId" = ${ownerUserId}
     ORDER BY "lastSeenAt" DESC
     LIMIT 100
  `;

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      targets: Number(targetCount?.count ?? 0),
      dueTargets: Number(dueCount?.count ?? 0),
      collectedUsers: Number(userCount?.count ?? 0),
      posts: Number(postCount?.count ?? 0),
      comments: Number(commentCount?.count ?? 0),
    },
    targets: targets.map((target) => ({ ...target, lastCompletedAt: dateOrNull(target.lastCompletedAt), nextDueAt: dateOrNull(target.nextDueAt) })),
    posts: posts.map((post) => ({ ...post, lastSeenAt: post.lastSeenAt.toISOString() })),
    users: users.map((user) => ({ ...user, lastSeenAt: user.lastSeenAt.toISOString(), lastProfileCrawledAt: dateOrNull(user.lastProfileCrawledAt), nextProfileCrawlAt: dateOrNull(user.nextProfileCrawlAt) })),
  };
}
