ALTER TABLE "WorkspaceSetting"
  ALTER COLUMN "deepDiveInterval" SET DEFAULT 3600000,
  ALTER COLUMN "deepDiveBatchSize" SET DEFAULT 500;

UPDATE "WorkspaceSetting"
SET "deepDiveInterval" = 3600000
WHERE "deepDiveInterval" = 7200000;

UPDATE "WorkspaceSetting"
SET "deepDiveBatchSize" = 500
WHERE "deepDiveBatchSize" IN (8, 50);
