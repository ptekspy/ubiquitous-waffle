ALTER TABLE "PostSnapshot"
  ADD COLUMN IF NOT EXISTS "latestViewCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "latestShareCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "latestInsightAt" TIMESTAMP(3);

ALTER TABLE "PostMetricSnapshot"
  ADD COLUMN IF NOT EXISTS "viewCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "shareCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "insightSource" TEXT,
  ADD COLUMN IF NOT EXISTS "insightRaw" JSONB;

CREATE INDEX IF NOT EXISTS "PostMetricSnapshot_viewCount_idx" ON "PostMetricSnapshot"("viewCount");
CREATE INDEX IF NOT EXISTS "PostSnapshot_latestInsightAt_idx" ON "PostSnapshot"("latestInsightAt");
