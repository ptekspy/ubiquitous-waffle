ALTER TABLE "HistoricalPostObservation"
  ADD COLUMN IF NOT EXISTS "viewCount" INTEGER;

CREATE INDEX IF NOT EXISTS "HistoricalPostObservation_viewCount_idx" ON "HistoricalPostObservation"("viewCount");
