CREATE TABLE IF NOT EXISTS "PostSuggestion" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "accountId" TEXT,
  "model" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "requestGroup" TEXT,
  "prompt" TEXT NOT NULL,
  "systemPrompt" TEXT NOT NULL,
  "context" JSONB,
  "result" JSONB,
  "subreddit" TEXT,
  "title" TEXT,
  "body" TEXT,
  "format" TEXT,
  "timing" TEXT,
  "rationale" TEXT,
  "confidence" TEXT,
  "error" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lockedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PostSuggestion_ownerUserId_status_createdAt_idx" ON "PostSuggestion"("ownerUserId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "PostSuggestion_ownerUserId_requestGroup_idx" ON "PostSuggestion"("ownerUserId", "requestGroup");
CREATE INDEX IF NOT EXISTS "PostSuggestion_accountId_createdAt_idx" ON "PostSuggestion"("accountId", "createdAt");
CREATE INDEX IF NOT EXISTS "PostSuggestion_model_idx" ON "PostSuggestion"("model");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PostSuggestion_ownerUserId_fkey') THEN
    ALTER TABLE "PostSuggestion" ADD CONSTRAINT "PostSuggestion_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PostSuggestion_accountId_fkey') THEN
    ALTER TABLE "PostSuggestion" ADD CONSTRAINT "PostSuggestion_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
