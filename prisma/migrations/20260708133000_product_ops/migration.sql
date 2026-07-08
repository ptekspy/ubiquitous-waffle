CREATE TABLE IF NOT EXISTS "WorkspaceSetting" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "activeAccountId" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
  "profileScanInterval" INTEGER NOT NULL DEFAULT 900000,
  "deepDiveInterval" INTEGER NOT NULL DEFAULT 7200000,
  "deepDiveBatchSize" INTEGER NOT NULL DEFAULT 8,
  "plannerEnabled" BOOLEAN NOT NULL DEFAULT true,
  "plannerModel" TEXT,
  "weeklyReportEnabled" BOOLEAN NOT NULL DEFAULT true,
  "trackedSubredditText" TEXT NOT NULL DEFAULT 'daresgonewild',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceSetting_ownerUserId_key" ON "WorkspaceSetting"("ownerUserId");
CREATE INDEX IF NOT EXISTS "WorkspaceSetting_activeAccountId_idx" ON "WorkspaceSetting"("activeAccountId");

CREATE TABLE IF NOT EXISTS "PlannedPost" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "accountId" TEXT,
  "subreddit" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "format" TEXT NOT NULL DEFAULT 'unknown',
  "plannedFor" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "expectedScore" INTEGER,
  "expectedFollowerGain" INTEGER,
  "actualScore" INTEGER,
  "actualFollowerGain" INTEGER,
  "linkedPostSnapshotId" TEXT,
  "rationale" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlannedPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlannedPost_ownerUserId_status_plannedFor_idx" ON "PlannedPost"("ownerUserId", "status", "plannedFor");
CREATE INDEX IF NOT EXISTS "PlannedPost_accountId_plannedFor_idx" ON "PlannedPost"("accountId", "plannedFor");
CREATE INDEX IF NOT EXISTS "PlannedPost_linkedPostSnapshotId_idx" ON "PlannedPost"("linkedPostSnapshotId");
CREATE INDEX IF NOT EXISTS "PlannedPost_subreddit_idx" ON "PlannedPost"("subreddit");

CREATE TABLE IF NOT EXISTS "TrackedSubreddit" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "subreddit" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrackedSubreddit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TrackedSubreddit_ownerUserId_subreddit_key" ON "TrackedSubreddit"("ownerUserId", "subreddit");
CREATE INDEX IF NOT EXISTS "TrackedSubreddit_ownerUserId_enabled_idx" ON "TrackedSubreddit"("ownerUserId", "enabled");
CREATE INDEX IF NOT EXISTS "TrackedSubreddit_subreddit_idx" ON "TrackedSubreddit"("subreddit");

CREATE TABLE IF NOT EXISTS "TrackedPeerAccount" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "label" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "latestScore" INTEGER,
  "latestFollowers" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrackedPeerAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TrackedPeerAccount_ownerUserId_username_key" ON "TrackedPeerAccount"("ownerUserId", "username");
CREATE INDEX IF NOT EXISTS "TrackedPeerAccount_ownerUserId_enabled_idx" ON "TrackedPeerAccount"("ownerUserId", "enabled");
CREATE INDEX IF NOT EXISTS "TrackedPeerAccount_username_idx" ON "TrackedPeerAccount"("username");

CREATE TABLE IF NOT EXISTS "WeeklyReport" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "accountId" TEXT,
  "weekStart" TIMESTAMP(3) NOT NULL,
  "weekEnd" TIMESTAMP(3) NOT NULL,
  "title" TEXT NOT NULL,
  "summary" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WeeklyReport_ownerUserId_weekStart_idx" ON "WeeklyReport"("ownerUserId", "weekStart");
CREATE INDEX IF NOT EXISTS "WeeklyReport_accountId_weekStart_idx" ON "WeeklyReport"("accountId", "weekStart");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceSetting_ownerUserId_fkey') THEN
    ALTER TABLE "WorkspaceSetting" ADD CONSTRAINT "WorkspaceSetting_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlannedPost_ownerUserId_fkey') THEN
    ALTER TABLE "PlannedPost" ADD CONSTRAINT "PlannedPost_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrackedSubreddit_ownerUserId_fkey') THEN
    ALTER TABLE "TrackedSubreddit" ADD CONSTRAINT "TrackedSubreddit_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrackedPeerAccount_ownerUserId_fkey') THEN
    ALTER TABLE "TrackedPeerAccount" ADD CONSTRAINT "TrackedPeerAccount_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WeeklyReport_ownerUserId_fkey') THEN
    ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
