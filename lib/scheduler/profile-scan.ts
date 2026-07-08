import { buildAccountAnalytics } from "@/lib/analytics";
import { saveAccountScan } from "@/lib/db/scans";
import { fetchRedditAccountData, RedditFetchError } from "@/lib/reddit";
import { prisma } from "@/lib/db/prisma";

const DEFAULT_PROFILE_SCAN_INTERVAL_MS = 15 * 60 * 1000;

export type ScheduledProfileScanResult =
  | { processed: true; accountId: string; username: string; scanId: string; profilePoints: number }
  | { processed: false; reason: string; browserRequired?: boolean };

function profileScanIntervalMs(): number {
  const parsed = Number.parseInt(process.env.PROFILE_SCAN_INTERVAL_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PROFILE_SCAN_INTERVAL_MS;
}

async function findNextDueAccount() {
  const cutoff = new Date(Date.now() - profileScanIntervalMs());
  const accounts = await prisma.redditAccount.findMany({
    where: {
      ownerUserId: { not: null },
    },
    include: {
      metricSnapshots: {
        orderBy: { capturedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "asc" },
  });

  return accounts.find((account) => {
    const latest = account.metricSnapshots[0]?.capturedAt;
    return !latest || latest <= cutoff;
  });
}

export async function processNextScheduledProfileScan(): Promise<ScheduledProfileScanResult> {
  const account = await findNextDueAccount();
  if (!account) return { processed: false, reason: "No Reddit accounts are due for a profile scan." };

  try {
    const data = await fetchRedditAccountData(account.username);
    const analytics = buildAccountAnalytics(data);
    const saved = await saveAccountScan(data, analytics, account.ownerUserId ?? undefined, { enqueueDeepDiveJobs: false });
    const profilePoints = await prisma.accountMetricSnapshot.count({ where: { accountId: saved.accountId } });

    return {
      processed: true,
      accountId: saved.accountId,
      username: data.profile.username,
      scanId: saved.scanId,
      profilePoints,
    };
  } catch (error) {
    if (error instanceof RedditFetchError && [403, 429].includes(error.status)) {
      return {
        processed: false,
        browserRequired: true,
        reason: `Server-side profile scan for u/${account.username} was blocked by Reddit. Keep the dashboard open with PaidPolitely Capture installed so the browser-assisted scheduler can use your Reddit session.`,
      };
    }

    throw error;
  }
}
