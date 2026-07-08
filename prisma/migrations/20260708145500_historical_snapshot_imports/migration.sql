CREATE TABLE IF NOT EXISTS "HistoricalSnapshot" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "accountId" TEXT,
  "source" TEXT NOT NULL,
  "sourceFileName" TEXT,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "postCount" INTEGER NOT NULL DEFAULT 0,
  "commentCount" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  CONSTRAINT "HistoricalSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HistoricalPostObservation" (
  "id" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "accountId" TEXT,
  "redditId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subreddit" TEXT NOT NULL,
  "permalink" TEXT NOT NULL,
  "createdUtc" INTEGER NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "numComments" INTEGER NOT NULL DEFAULT 0,
  "upvoteRatio" DOUBLE PRECISION,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "raw" JSONB,
  CONSTRAINT "HistoricalPostObservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HistoricalCommentObservation" (
  "id" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "accountId" TEXT,
  "redditId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "subreddit" TEXT NOT NULL,
  "permalink" TEXT NOT NULL,
  "createdUtc" INTEGER NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "linkTitle" TEXT,
  "viewCount" INTEGER,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "raw" JSONB,
  CONSTRAINT "HistoricalCommentObservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "HistoricalSnapshot_ownerUserId_capturedAt_idx" ON "HistoricalSnapshot"("ownerUserId", "capturedAt");
CREATE INDEX IF NOT EXISTS "HistoricalSnapshot_accountId_capturedAt_idx" ON "HistoricalSnapshot"("accountId", "capturedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "HistoricalSnapshot_ownerUserId_sourceFileName_capturedAt_key" ON "HistoricalSnapshot"("ownerUserId", "sourceFileName", "capturedAt") WHERE "sourceFileName" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "HistoricalPostObservation_snapshotId_redditId_key" ON "HistoricalPostObservation"("snapshotId", "redditId");
CREATE INDEX IF NOT EXISTS "HistoricalPostObservation_ownerUserId_observedAt_idx" ON "HistoricalPostObservation"("ownerUserId", "observedAt");
CREATE INDEX IF NOT EXISTS "HistoricalPostObservation_redditId_observedAt_idx" ON "HistoricalPostObservation"("redditId", "observedAt");
CREATE INDEX IF NOT EXISTS "HistoricalPostObservation_subreddit_observedAt_idx" ON "HistoricalPostObservation"("subreddit", "observedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "HistoricalCommentObservation_snapshotId_redditId_key" ON "HistoricalCommentObservation"("snapshotId", "redditId");
CREATE INDEX IF NOT EXISTS "HistoricalCommentObservation_ownerUserId_observedAt_idx" ON "HistoricalCommentObservation"("ownerUserId", "observedAt");
CREATE INDEX IF NOT EXISTS "HistoricalCommentObservation_redditId_observedAt_idx" ON "HistoricalCommentObservation"("redditId", "observedAt");
CREATE INDEX IF NOT EXISTS "HistoricalCommentObservation_subreddit_observedAt_idx" ON "HistoricalCommentObservation"("subreddit", "observedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HistoricalSnapshot_ownerUserId_fkey') THEN
    ALTER TABLE "HistoricalSnapshot" ADD CONSTRAINT "HistoricalSnapshot_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HistoricalPostObservation_snapshotId_fkey') THEN
    ALTER TABLE "HistoricalPostObservation" ADD CONSTRAINT "HistoricalPostObservation_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "HistoricalSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HistoricalCommentObservation_snapshotId_fkey') THEN
    ALTER TABLE "HistoricalCommentObservation" ADD CONSTRAINT "HistoricalCommentObservation_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "HistoricalSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
