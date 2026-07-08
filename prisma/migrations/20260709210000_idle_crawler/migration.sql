CREATE TABLE IF NOT EXISTS "IdleCrawlTarget" (
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
);

CREATE TABLE IF NOT EXISTS "CollectedRedditUser" (
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
);

CREATE TABLE IF NOT EXISTS "CrawledPost" (
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
);

CREATE TABLE IF NOT EXISTS "CrawledComment" (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS "IdleCrawlTarget_ownerUserId_dedupeKey_key" ON "IdleCrawlTarget"("ownerUserId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "IdleCrawlTarget_ownerUserId_enabled_nextDueAt_idx" ON "IdleCrawlTarget"("ownerUserId", "enabled", "nextDueAt");
CREATE INDEX IF NOT EXISTS "IdleCrawlTarget_ownerUserId_kind_idx" ON "IdleCrawlTarget"("ownerUserId", "kind");
CREATE INDEX IF NOT EXISTS "IdleCrawlTarget_lockedAt_idx" ON "IdleCrawlTarget"("lockedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "CollectedRedditUser_ownerUserId_username_key" ON "CollectedRedditUser"("ownerUserId", "username");
CREATE INDEX IF NOT EXISTS "CollectedRedditUser_ownerUserId_enabled_nextProfileCrawlAt_idx" ON "CollectedRedditUser"("ownerUserId", "enabled", "nextProfileCrawlAt");
CREATE INDEX IF NOT EXISTS "CollectedRedditUser_lastSeenAt_idx" ON "CollectedRedditUser"("lastSeenAt");

CREATE UNIQUE INDEX IF NOT EXISTS "CrawledPost_ownerUserId_redditId_key" ON "CrawledPost"("ownerUserId", "redditId");
CREATE INDEX IF NOT EXISTS "CrawledPost_ownerUserId_lastSeenAt_idx" ON "CrawledPost"("ownerUserId", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "CrawledPost_ownerUserId_subreddit_lastSeenAt_idx" ON "CrawledPost"("ownerUserId", "subreddit", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "CrawledPost_author_idx" ON "CrawledPost"("author");

CREATE UNIQUE INDEX IF NOT EXISTS "CrawledComment_ownerUserId_redditId_key" ON "CrawledComment"("ownerUserId", "redditId");
CREATE INDEX IF NOT EXISTS "CrawledComment_ownerUserId_lastSeenAt_idx" ON "CrawledComment"("ownerUserId", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "CrawledComment_author_idx" ON "CrawledComment"("author");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IdleCrawlTarget_ownerUserId_fkey') THEN
    ALTER TABLE "IdleCrawlTarget" ADD CONSTRAINT "IdleCrawlTarget_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CollectedRedditUser_ownerUserId_fkey') THEN
    ALTER TABLE "CollectedRedditUser" ADD CONSTRAINT "CollectedRedditUser_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrawledPost_ownerUserId_fkey') THEN
    ALTER TABLE "CrawledPost" ADD CONSTRAINT "CrawledPost_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrawledPost_targetId_fkey') THEN
    ALTER TABLE "CrawledPost" ADD CONSTRAINT "CrawledPost_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "IdleCrawlTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrawledComment_ownerUserId_fkey') THEN
    ALTER TABLE "CrawledComment" ADD CONSTRAINT "CrawledComment_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrawledComment_targetId_fkey') THEN
    ALTER TABLE "CrawledComment" ADD CONSTRAINT "CrawledComment_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "IdleCrawlTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
