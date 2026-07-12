-- DropIndex
DROP INDEX "PostSnapshot_latestInsightAt_idx";

-- AlterTable
ALTER TABLE "PlannedPost" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TrackedPeerAccount" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TrackedSubreddit" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WorkspaceSetting" ALTER COLUMN "updatedAt" DROP DEFAULT;
