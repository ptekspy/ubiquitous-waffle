import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ensureProductOpsTables } from "@/lib/product/schema";

export const dynamic = "force-dynamic";

type ErrorResponse = { error: string };
type NextAction = {
  key: string;
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
  href: string;
};

function action(key: string, priority: NextAction["priority"], title: string, detail: string, href: string): NextAction {
  return { key, priority, title, detail, href };
}

export async function GET(): Promise<NextResponse<{ generatedAt: string; actions: NextAction[] } | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  try {
    await ensureProductOpsTables();
    const account = await prisma.redditAccount.findFirst({ where: { ownerUserId: user.id }, orderBy: { updatedAt: "desc" }, select: { id: true, username: true } });
    const accountId = account?.id ?? null;
    const [latestScan, queuedDeepDives, failedPlanner, latestPlanner, plannedCount, trackedSubredditCount, trackedPeerCount] = await Promise.all([
      accountId ? prisma.accountScan.findFirst({ where: { accountId }, orderBy: { fetchedAt: "desc" }, select: { id: true, bestSubreddit: true, bestPostingHourUtc: true, cleanedPostCount: true } }) : null,
      prisma.postDeepDiveJob.count({ where: { ownerUserId: user.id, status: "QUEUED" } }),
      accountId ? prisma.plannerJob.count({ where: { accountId, status: "FAILED" } }) : 0,
      accountId ? prisma.plannerJob.findFirst({ where: { accountId }, orderBy: { createdAt: "desc" }, select: { status: true, result: true, updatedAt: true } }) : null,
      prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "PlannedPost" WHERE "ownerUserId" = ${user.id}`,
      prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "TrackedSubreddit" WHERE "ownerUserId" = ${user.id}`,
      prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "TrackedPeerAccount" WHERE "ownerUserId" = ${user.id}`,
    ]);

    const actions: NextAction[] = [];

    if (!account) {
      actions.push(action("connect-account", "high", "Connect a Reddit username", "Save the account you want PaidPolitely to analyse.", "/dashboard/settings"));
    } else if (!latestScan) {
      actions.push(action("run-first-scan", "high", `Run the first scan for u/${account.username}`, "The dashboard needs one captured profile scan before it can give useful recommendations.", "/dashboard"));
    }

    if (latestScan?.bestSubreddit) {
      const hour = latestScan.bestPostingHourUtc === null ? "your best observed window" : `${String(latestScan.bestPostingHourUtc).padStart(2, "0")}:00 UTC`;
      actions.push(action("repeat-best-subreddit", "high", `Plan another test in r/${latestScan.bestSubreddit}`, `Your latest scan points to r/${latestScan.bestSubreddit}; schedule a post around ${hour}.`, "/dashboard/product-ops"));
    }

    if (queuedDeepDives > 0) {
      actions.push(action("clear-deep-dives", queuedDeepDives > 100 ? "high" : "medium", "Let the extension clear deep dives", `${queuedDeepDives} post deep-dive job(s) are waiting for browser capture.`, "/dashboard/jobs"));
    }

    if (failedPlanner > 0 || latestPlanner?.status === "FAILED") {
      actions.push(action("fix-planner", "medium", "Review failed planner jobs", "The planner has failed jobs. Check Ollama model size, timeout, and worker status.", "/dashboard/jobs"));
    }

    if (Number(plannedCount[0]?.count ?? 0) === 0) {
      actions.push(action("create-plan", "medium", "Create a planned post", "Start tracking expected score and actual score so the app can learn from posts.", "/dashboard/product-ops"));
    }

    if (Number(trackedSubredditCount[0]?.count ?? 0) === 0) {
      actions.push(action("track-subreddits", "low", "Track target subreddits", "Add the subreddits you care about so subreddit intelligence becomes useful.", "/dashboard/product-ops"));
    }

    if (Number(trackedPeerCount[0]?.count ?? 0) === 0) {
      actions.push(action("track-peers", "low", "Add peer accounts", "Track comparable accounts to create a peer benchmark and title-pattern ideas.", "/dashboard/product-ops"));
    }

    return NextResponse.json({ generatedAt: new Date().toISOString(), actions: actions.slice(0, 8) });
  } catch (error) {
    return NextResponse.json<ErrorResponse>({ error: error instanceof Error ? error.message : "Unable to load next actions." }, { status: 500 });
  }
}
