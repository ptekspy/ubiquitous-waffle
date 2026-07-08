DO $$
BEGIN
  IF to_regclass('public."WorkspaceSetting"') IS NOT NULL THEN
    ALTER TABLE "WorkspaceSetting" ALTER COLUMN "deepDiveBatchSize" SET DEFAULT 50;
    UPDATE "WorkspaceSetting" SET "deepDiveBatchSize" = 50 WHERE "deepDiveBatchSize" = 8;
  END IF;
END $$;
