import type { Prisma } from "@prisma/client";

import type { AccountAnalytics, AnalyzeResponse, RedditProfile } from "@/lib/types";
import { prisma } from "./prisma";

type LatestScanRecord = NonNullable<Awaited<ReturnType<typeof findLatestScanForUser>>>;

type WorkspaceSettings = {
  redditUsername: string | null;
};

export type WorkspaceResponse = {
  settings: WorkspaceSettings;
  latest: AnalyzeResponse | null;
};

function isAccountAnalytics(value: Prisma.JsonValue): value is AccountAnalytics {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "summary" in value && "subreddits" in value;
}

function stringArray(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toProfile(account: LatestScanRecord["account"]): RedditProfile {
  return {
    id: account.redditId ?? account.username,
    username: account.username,
    createdUtc: account.createdUtc,
    totalKarma: account.totalKarma,
    linkKarma: account.linkKarma,
    commentKarma: account.commentKarma,
    awardeeKarma: account.awardeeKarma,
    awarderKarma: account.awarderKarma,
    over18: account.over18,
    iconUrl: account.iconUrl,
  };
}

async function findLatestScanForUser(userId: string) {
  return prisma.accountScan.findFirst({
    where: {
      account: {
        ownerUserId: userId,
      },
    },
    include: {
      account: true,
      plannerJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { fetchedAt: "desc" },
  });
}

function toPlannerJob(job: LatestScanRecord["plannerJobs"][number] | undefined): AnalyzeResponse["plannerJob"] {
  if (!job) return null;

  return {
    id: job.id,
    status: job.status,
    model: job.model,
    result: typeof job.result === "object" && job.result !== null && !Array.isArray(job.result) ? job.result as Record<string, unknown> : null,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function toAnalyzeResponse(scan: LatestScanRecord): AnalyzeResponse | null {
  if (!isAccountAnalytics(scan.analytics)) return null;

  return {
    profile: toProfile(scan.account),
    analytics: scan.analytics,
    warnings: stringArray(scan.warnings),
    scanId: scan.id,
    plannerJob: toPlannerJob(scan.plannerJobs[0]),
  };
}

export async function getWorkspaceForUser(userId: string): Promise<WorkspaceResponse> {
  const [user, latestScan] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { redditUsername: true },
    }),
    findLatestScanForUser(userId),
  ]);

  const latest = latestScan ? toAnalyzeResponse(latestScan) : null;

  return {
    settings: {
      redditUsername: user?.redditUsername ?? latest?.profile.username ?? null,
    },
    latest,
  };
}

export async function updateWorkspaceRedditUsername(userId: string, redditUsername: string): Promise<WorkspaceSettings> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { redditUsername },
    select: { redditUsername: true },
  });

  return {
    redditUsername: user.redditUsername,
  };
}
