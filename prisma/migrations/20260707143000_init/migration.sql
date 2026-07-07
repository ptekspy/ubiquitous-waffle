-- CreateEnum
CREATE TYPE "PlannerJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "redditId" TEXT,
  "username" TEXT NOT NULL,
  "createdUtc" INTEGER,
  "totalKarma" INTEGER NOT NULL DEFAULT 0,
  "linkKarma" INTEGER NOT NULL DEFAULT 0,
  "commentKarma" INTEGER NOT NULL DEFAULT 0,
  "awardeeKarma" INTEGER NOT NULL DEFAULT 0,
  "awarderKarma" INTEGER NOT NULL DEFAULT 0,
  "over18" BOOLEAN NOT NULL DEFAULT false,
  "iconUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountScan" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3),
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rawPostCount" INTEGER NOT NULL DEFAULT 0,
  "rawCommentCount" INTEGER NOT NULL DEFAULT 0,
  "cleanedPostCount" INTEGER NOT NULL DEFAULT 0,
  "cleanedCommentCount" INTEGER NOT NULL DEFAULT 0,
  "totalPostScore" INTEGER NOT NULL DEFAULT 0,
  "totalCommentScore" INTEGER NOT NULL DEFAULT 0,
  "averagePostScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "averageCommentScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "bestSubreddit" TEXT,
  "bestPostingHourUtc" INTEGER,
  "warnings" JSONB,
  "metadata" JSONB,
  "analytics" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostSnapshot" (
  "id" TEXT NOT NULL,
  "scanId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "redditId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subreddit" TEXT NOT NULL,
  "permalink" TEXT NOT NULL,
  "url" TEXT,
  "createdUtc" INTEGER NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "numComments" INTEGER NOT NULL DEFAULT 0,
  "upvoteRatio" DOUBLE PRECISION,
  "linkFlairText" TEXT,
  "over18" BOOLEAN NOT NULL DEFAULT false,
  "isSelf" BOOLEAN NOT NULL DEFAULT false,
  "domain" TEXT,
  "postHint" TEXT,
  "contentType" TEXT NOT NULL,
  "mediaKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentSnapshot" (
  "id" TEXT NOT NULL,
  "scanId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "redditId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "subreddit" TEXT NOT NULL,
  "permalink" TEXT NOT NULL,
  "createdUtc" INTEGER NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "linkTitle" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubredditSnapshot" (
  "id" TEXT NOT NULL,
  "scanId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "subreddit" TEXT NOT NULL,
  "posts" INTEGER NOT NULL DEFAULT 0,
  "comments" INTEGER NOT NULL DEFAULT 0,
  "totalScore" INTEGER NOT NULL DEFAULT 0,
  "averagePostScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "averageCommentScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubredditSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaGroup" (
  "id" TEXT NOT NULL,
  "scanId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "mediaKey" TEXT NOT NULL,
  "postCount" INTEGER NOT NULL DEFAULT 0,
  "totalScore" INTEGER NOT NULL DEFAULT 0,
  "averageScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "bestSubreddit" TEXT,
  "bestTitle" TEXT,
  "bestPostScore" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannerJob" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "scanId" TEXT NOT NULL,
  "status" "PlannerJobStatus" NOT NULL DEFAULT 'QUEUED',
  "model" TEXT,
  "prompt" TEXT NOT NULL,
  "result" JSONB,
  "error" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lockedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlannerJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_username_key" ON "Account"("username");
CREATE INDEX "Account_username_idx" ON "Account"("username");
CREATE INDEX "AccountScan_accountId_fetchedAt_idx" ON "AccountScan"("accountId", "fetchedAt");
CREATE INDEX "AccountScan_source_idx" ON "AccountScan"("source");
CREATE UNIQUE INDEX "PostSnapshot_scanId_redditId_key" ON "PostSnapshot"("scanId", "redditId");
CREATE INDEX "PostSnapshot_accountId_subreddit_idx" ON "PostSnapshot"("accountId", "subreddit");
CREATE INDEX "PostSnapshot_accountId_mediaKey_idx" ON "PostSnapshot"("accountId", "mediaKey");
CREATE INDEX "PostSnapshot_createdUtc_idx" ON "PostSnapshot"("createdUtc");
CREATE UNIQUE INDEX "CommentSnapshot_scanId_redditId_key" ON "CommentSnapshot"("scanId", "redditId");
CREATE INDEX "CommentSnapshot_accountId_subreddit_idx" ON "CommentSnapshot"("accountId", "subreddit");
CREATE INDEX "CommentSnapshot_createdUtc_idx" ON "CommentSnapshot"("createdUtc");
CREATE UNIQUE INDEX "SubredditSnapshot_scanId_subreddit_key" ON "SubredditSnapshot"("scanId", "subreddit");
CREATE INDEX "SubredditSnapshot_accountId_subreddit_idx" ON "SubredditSnapshot"("accountId", "subreddit");
CREATE UNIQUE INDEX "MediaGroup_scanId_mediaKey_key" ON "MediaGroup"("scanId", "mediaKey");
CREATE INDEX "MediaGroup_accountId_totalScore_idx" ON "MediaGroup"("accountId", "totalScore");
CREATE INDEX "PlannerJob_status_createdAt_idx" ON "PlannerJob"("status", "createdAt");
CREATE INDEX "PlannerJob_accountId_createdAt_idx" ON "PlannerJob"("accountId", "createdAt");
CREATE INDEX "PlannerJob_scanId_idx" ON "PlannerJob"("scanId");

-- AddForeignKey
ALTER TABLE "AccountScan" ADD CONSTRAINT "AccountScan_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostSnapshot" ADD CONSTRAINT "PostSnapshot_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "AccountScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommentSnapshot" ADD CONSTRAINT "CommentSnapshot_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "AccountScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubredditSnapshot" ADD CONSTRAINT "SubredditSnapshot_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "AccountScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaGroup" ADD CONSTRAINT "MediaGroup_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "AccountScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlannerJob" ADD CONSTRAINT "PlannerJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlannerJob" ADD CONSTRAINT "PlannerJob_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "AccountScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
