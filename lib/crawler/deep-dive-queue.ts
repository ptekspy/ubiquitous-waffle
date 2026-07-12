import { prisma } from "@/lib/db/prisma";

export const DEFAULT_DEEP_DIVE_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

type DuePostRow = {
  id: string;
  ownerUserId: string | null;
};

export function deepDiveRefreshIntervalMs(): number {
  const parsed = Number.parseInt(process.env.DEEP_DIVE_REFRESH_INTERVAL_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DEEP_DIVE_REFRESH_INTERVAL_MS;
}

export async function createDuePostDeepDiveJobs(ownerUserId: string | null, limit = 1): Promise<number> {
  const cutoff = new Date(Date.now() - deepDiveRefreshIntervalMs());
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
  const rows = ownerUserId
    ? await prisma.$queryRaw<DuePostRow[]>`
        WITH owner_posts AS (
          SELECT p.*, account."ownerUserId"
          FROM "PostSnapshot" p
          INNER JOIN "RedditAccount" account ON account."id" = p."accountId"
          WHERE account."ownerUserId" = ${ownerUserId}
        ),
        latest_posts AS (
          SELECT DISTINCT ON ("redditId") "id", "redditId", "ownerUserId", "score", "createdAt"
          FROM owner_posts
          ORDER BY "redditId", "createdAt" DESC
        ),
        post_freshness AS (
          SELECT "redditId", MAX(COALESCE("deepDiveFetchedAt", "latestInsightAt")) AS "lastRefreshAt"
          FROM owner_posts
          GROUP BY "redditId"
        )
        SELECT latest_posts."id", latest_posts."ownerUserId"
        FROM latest_posts
        INNER JOIN post_freshness ON post_freshness."redditId" = latest_posts."redditId"
        WHERE (post_freshness."lastRefreshAt" IS NULL OR post_freshness."lastRefreshAt" <= ${cutoff})
          AND NOT EXISTS (
            SELECT 1
            FROM "PostDeepDiveJob" job
            INNER JOIN "PostSnapshot" queued_post ON queued_post."id" = job."postSnapshotId"
            WHERE queued_post."redditId" = latest_posts."redditId"
              AND job."status" IN ('QUEUED', 'RUNNING')
          )
        ORDER BY post_freshness."lastRefreshAt" ASC NULLS FIRST, latest_posts."score" DESC, latest_posts."createdAt" DESC
        LIMIT ${safeLimit}
      `
    : await prisma.$queryRaw<DuePostRow[]>`
        WITH owner_posts AS (
          SELECT p.*, account."ownerUserId"
          FROM "PostSnapshot" p
          INNER JOIN "RedditAccount" account ON account."id" = p."accountId"
          WHERE account."ownerUserId" IS NOT NULL
        ),
        latest_posts AS (
          SELECT DISTINCT ON ("redditId") "id", "redditId", "ownerUserId", "score", "createdAt"
          FROM owner_posts
          ORDER BY "redditId", "createdAt" DESC
        ),
        post_freshness AS (
          SELECT "redditId", MAX(COALESCE("deepDiveFetchedAt", "latestInsightAt")) AS "lastRefreshAt"
          FROM owner_posts
          GROUP BY "redditId"
        )
        SELECT latest_posts."id", latest_posts."ownerUserId"
        FROM latest_posts
        INNER JOIN post_freshness ON post_freshness."redditId" = latest_posts."redditId"
        WHERE (post_freshness."lastRefreshAt" IS NULL OR post_freshness."lastRefreshAt" <= ${cutoff})
          AND NOT EXISTS (
            SELECT 1
            FROM "PostDeepDiveJob" job
            INNER JOIN "PostSnapshot" queued_post ON queued_post."id" = job."postSnapshotId"
            WHERE queued_post."redditId" = latest_posts."redditId"
              AND job."status" IN ('QUEUED', 'RUNNING')
          )
        ORDER BY post_freshness."lastRefreshAt" ASC NULLS FIRST, latest_posts."score" DESC, latest_posts."createdAt" DESC
        LIMIT ${safeLimit}
      `;

  if (rows.length === 0) return 0;

  await prisma.postDeepDiveJob.createMany({
    data: rows.map((row) => ({
      ownerUserId: row.ownerUserId,
      postSnapshotId: row.id,
      status: "QUEUED" as const,
    })),
  });

  return rows.length;
}
