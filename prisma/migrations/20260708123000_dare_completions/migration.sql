CREATE TABLE IF NOT EXISTS "DareCompletion" (
  "id" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "ownerUserId" TEXT,
  "accountId" TEXT NOT NULL,
  "scanId" TEXT,
  "postSnapshotId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "subreddit" TEXT NOT NULL DEFAULT 'daresgonewild',
  "completionType" TEXT NOT NULL,
  "dareSlug" TEXT,
  "dareName" TEXT,
  "dareLevel" TEXT,
  "darerUsername" TEXT,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DareCompletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DareCompletion_dedupeKey_key" ON "DareCompletion"("dedupeKey");
CREATE INDEX IF NOT EXISTS "DareCompletion_ownerUserId_status_idx" ON "DareCompletion"("ownerUserId", "status");
CREATE INDEX IF NOT EXISTS "DareCompletion_accountId_detectedAt_idx" ON "DareCompletion"("accountId", "detectedAt");
CREATE INDEX IF NOT EXISTS "DareCompletion_scanId_idx" ON "DareCompletion"("scanId");
CREATE INDEX IF NOT EXISTS "DareCompletion_postSnapshotId_idx" ON "DareCompletion"("postSnapshotId");
CREATE INDEX IF NOT EXISTS "DareCompletion_dareSlug_idx" ON "DareCompletion"("dareSlug");
CREATE INDEX IF NOT EXISTS "DareCompletion_completionType_idx" ON "DareCompletion"("completionType");
CREATE INDEX IF NOT EXISTS "DareCompletion_status_idx" ON "DareCompletion"("status");

ALTER TABLE "DareCompletion" ADD CONSTRAINT "DareCompletion_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DareCompletion" ADD CONSTRAINT "DareCompletion_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DareCompletion" ADD CONSTRAINT "DareCompletion_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "AccountScan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DareCompletion" ADD CONSTRAINT "DareCompletion_postSnapshotId_fkey" FOREIGN KEY ("postSnapshotId") REFERENCES "PostSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
