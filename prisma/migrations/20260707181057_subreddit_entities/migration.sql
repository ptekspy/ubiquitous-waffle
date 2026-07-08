-- AlterTable
ALTER TABLE "PostDeepDiveJob" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PostThreadComment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Subreddit" ALTER COLUMN "updatedAt" DROP DEFAULT;
