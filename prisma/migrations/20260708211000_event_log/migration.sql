CREATE TABLE IF NOT EXISTS "EventLog" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT,
  "accountId" TEXT,
  "scanId" TEXT,
  "jobId" TEXT,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'info',
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventLog_ownerUserId_createdAt_idx" ON "EventLog"("ownerUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "EventLog_accountId_createdAt_idx" ON "EventLog"("accountId", "createdAt");
CREATE INDEX IF NOT EXISTS "EventLog_scanId_idx" ON "EventLog"("scanId");
CREATE INDEX IF NOT EXISTS "EventLog_jobId_idx" ON "EventLog"("jobId");
CREATE INDEX IF NOT EXISTS "EventLog_type_createdAt_idx" ON "EventLog"("type", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventLog_ownerUserId_fkey') THEN
    ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
