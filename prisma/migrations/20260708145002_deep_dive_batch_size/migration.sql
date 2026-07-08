/*
  Warnings:

  - You are about to drop the `PlannedPost` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TrackedPeerAccount` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TrackedSubreddit` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WeeklyReport` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WorkspaceSetting` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PlannedPost" DROP CONSTRAINT "PlannedPost_ownerUserId_fkey";

-- DropForeignKey
ALTER TABLE "TrackedPeerAccount" DROP CONSTRAINT "TrackedPeerAccount_ownerUserId_fkey";

-- DropForeignKey
ALTER TABLE "TrackedSubreddit" DROP CONSTRAINT "TrackedSubreddit_ownerUserId_fkey";

-- DropForeignKey
ALTER TABLE "WeeklyReport" DROP CONSTRAINT "WeeklyReport_ownerUserId_fkey";

-- DropForeignKey
ALTER TABLE "WorkspaceSetting" DROP CONSTRAINT "WorkspaceSetting_ownerUserId_fkey";

-- DropTable
DROP TABLE "PlannedPost";

-- DropTable
DROP TABLE "TrackedPeerAccount";

-- DropTable
DROP TABLE "TrackedSubreddit";

-- DropTable
DROP TABLE "WeeklyReport";

-- DropTable
DROP TABLE "WorkspaceSetting";
