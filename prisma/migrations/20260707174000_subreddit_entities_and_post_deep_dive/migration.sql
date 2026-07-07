-- Subreddits become first-class entities.
CREATE TABLE "Subreddit" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "displayName" TEXT,
  "title" TEXT,
  "publicDescription" TEXT,
  "over18" BOOLEAN,
  "subscribers" INTEGER,
  "iconUrl" TEXT,
  "createdUtc" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subreddit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subreddit_name_key" ON "Subreddit"("name");
CREATE INDEX "Subreddit_name_idx" ON "Subreddit"("name");

-- Add subreddit links and deep-dive metric fields to existing scan rows.
ALTER TABLE "PostSnapshot" ADD COLUMN "subredditId" TEXT;
ALTER TABLE "PostSnapshot" ADD COLUMN "deepDiveStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "PostSnapshot" ADD COLUMN "deepDiveFetchedAt" TIMESTAMP(3);
ALTER TABLE "PostSnapshot" ADD COLUMN "refreshedScore" INTEGER;
ALTER TABLE "PostSnapshot" ADD COLUMN "refreshedNumComments" INTEGER;
ALTER TABLE "PostSnapshot" ADD COLUMN "refreshedUpvoteRatio" DOUBLE PRECISION;
ALTER TABLE "PostSnapshot" ADD COLUMN "estimatedUpvotes" INTEGER;
ALTER TABLE "PostSnapshot" ADD COLUMN "estimatedDownvotes" INTEGER;

ALTER TABLE "CommentSnapshot" ADD COLUMN "subredditId" TEXT;
ALTER TABLE "SubredditSnapshot" ADD COLUMN "subredditId" TEXT;

-- Backfill subreddit rows from saved scans.
INSERT INTO "Subreddit" ("id", "name", "displayName", "createdAt", "updatedAt")
SELECT md5(lower(source."subreddit")), lower(source."subreddit"), source."subreddit", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "subreddit" FROM "PostSnapshot" WHERE "subreddit" IS NOT NULL AND "subreddit" <> ''
  UNION
  SELECT DISTINCT "subreddit" FROM "CommentSnapshot" WHERE "subreddit" IS NOT NULL AND "subreddit" <> ''
  UNION
  SELECT DISTINCT "subreddit" FROM "SubredditSnapshot" WHERE "subreddit" IS NOT NULL AND "subreddit" <> ''
) source
ON CONFLICT ("name") DO NOTHING;

UPDATE "PostSnapshot" p SET "subredditId" = s."id" FROM "Subreddit" s WHERE s."name" = lower(p."subreddit");
UPDATE "CommentSnapshot" c SET "subredditId" = s."id" FROM "Subreddit" s WHERE s."name" = lower(c."subreddit");
UPDATE "SubredditSnapshot" ss SET "subredditId" = s."id" FROM "Subreddit" s WHERE s."name" = lower(ss."subreddit");

-- Deep-dive job status enum.
CREATE TYPE "PostDeepDiveJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "PostMetricSnapshot" (
  "id" TEXT NOT NULL,
  "postSnapshotId" TEXT NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "numComments" INTEGER NOT NULL DEFAULT 0,
  "upvoteRatio" DOUBLE PRECISION,
  "estimatedUpvotes" INTEGER,
  "estimatedDownvotes" INTEGER,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostMetricSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PostThreadComment" (
  "id" TEXT NOT NULL,
  "postSnapshotId" TEXT NOT NULL,
  "redditId" TEXT NOT NULL,
  "parentRedditId" TEXT,
  "author" TEXT,
  "body" TEXT NOT NULL,
  "subreddit" TEXT NOT NULL,
  "permalink" TEXT,
  "createdUtc" INTEGER NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "depth" INTEGER NOT NULL DEFAULT 0,
  "isSubmitter" BOOLEAN NOT NULL DEFAULT false,
  "distinguished" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostThreadComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PostDeepDiveJob" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT,
  "postSnapshotId" TEXT NOT NULL,
  "status" "PostDeepDiveJobStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "lockedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostDeepDiveJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PostSnapshot_subredditId_idx" ON "PostSnapshot"("subredditId");
CREATE INDEX "CommentSnapshot_subredditId_idx" ON "CommentSnapshot"("subredditId");
CREATE INDEX "SubredditSnapshot_subredditId_idx" ON "SubredditSnapshot"("subredditId");
CREATE INDEX "PostMetricSnapshot_postSnapshotId_capturedAt_idx" ON "PostMetricSnapshot"("postSnapshotId", "capturedAt");
CREATE UNIQUE INDEX "PostThreadComment_postSnapshotId_redditId_key" ON "PostThreadComment"("postSnapshotId", "redditId");
CREATE INDEX "PostThreadComment_postSnapshotId_score_idx" ON "PostThreadComment"("postSnapshotId", "score");
CREATE INDEX "PostThreadComment_author_idx" ON "PostThreadComment"("author");
CREATE INDEX "PostDeepDiveJob_status_createdAt_idx" ON "PostDeepDiveJob"("status", "createdAt");
CREATE INDEX "PostDeepDiveJob_ownerUserId_createdAt_idx" ON "PostDeepDiveJob"("ownerUserId", "createdAt");
CREATE INDEX "PostDeepDiveJob_postSnapshotId_idx" ON "PostDeepDiveJob"("postSnapshotId");

ALTER TABLE "PostSnapshot" ADD CONSTRAINT "PostSnapshot_subredditId_fkey" FOREIGN KEY ("subredditId") REFERENCES "Subreddit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommentSnapshot" ADD CONSTRAINT "CommentSnapshot_subredditId_fkey" FOREIGN KEY ("subredditId") REFERENCES "Subreddit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubredditSnapshot" ADD CONSTRAINT "SubredditSnapshot_subredditId_fkey" FOREIGN KEY ("subredditId") REFERENCES "Subreddit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PostMetricSnapshot" ADD CONSTRAINT "PostMetricSnapshot_postSnapshotId_fkey" FOREIGN KEY ("postSnapshotId") REFERENCES "PostSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostThreadComment" ADD CONSTRAINT "PostThreadComment_postSnapshotId_fkey" FOREIGN KEY ("postSnapshotId") REFERENCES "PostSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostDeepDiveJob" ADD CONSTRAINT "PostDeepDiveJob_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostDeepDiveJob" ADD CONSTRAINT "PostDeepDiveJob_postSnapshotId_fkey" FOREIGN KEY ("postSnapshotId") REFERENCES "PostSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
