-- Add follower counts to the saved Reddit account profile.
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "followerCount" INTEGER;

-- Time-series account metrics for 15-minute profile scans.
CREATE TABLE IF NOT EXISTS "AccountMetricSnapshot" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "scanId" TEXT,
  "source" TEXT NOT NULL,
  "totalKarma" INTEGER NOT NULL DEFAULT 0,
  "linkKarma" INTEGER NOT NULL DEFAULT 0,
  "commentKarma" INTEGER NOT NULL DEFAULT 0,
  "awardeeKarma" INTEGER NOT NULL DEFAULT 0,
  "awarderKarma" INTEGER NOT NULL DEFAULT 0,
  "followerCount" INTEGER,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccountMetricSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AccountMetricSnapshot_accountId_capturedAt_idx" ON "AccountMetricSnapshot"("accountId", "capturedAt");
CREATE INDEX IF NOT EXISTS "AccountMetricSnapshot_scanId_idx" ON "AccountMetricSnapshot"("scanId");

ALTER TABLE "AccountMetricSnapshot"
  ADD CONSTRAINT "AccountMetricSnapshot_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountMetricSnapshot"
  ADD CONSTRAINT "AccountMetricSnapshot_scanId_fkey"
  FOREIGN KEY ("scanId") REFERENCES "AccountScan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
