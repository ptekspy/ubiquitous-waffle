import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const DEFAULT_DEEP_DIVE_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;

type ErrorResponse = {
  error: string;
};

function deepDiveRefreshIntervalMs(): number {
  const parsed = Number.parseInt(process.env.DEEP_DIVE_REFRESH_INTERVAL_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DEEP_DIVE_REFRESH_INTERVAL_MS;
}

async function createDueJobIfNeeded(userId: string) {
  const cutoff = new Date(Date.now() - deepDiveRefreshIntervalMs());
  const existing = await prisma.postDeepDiveJob.findFirst({
    where: {
      ownerUserId: userId,
      OR: [{ status: "QUEUED" }, { status: "RUNNING" }, { status: "FAILED", error: { startsWith: "BROWSER_REQUIRED" } }],
    },
    select: { id: true },
  });

  if (existing) return;

  const duePost = await prisma.postSnapshot.findFirst({
    where: {
      scan: {
        account: {
          ownerUserId: userId,
        },
      },
      OR: [{ deepDiveFetchedAt: null }, { deepDiveFetchedAt: { lte: cutoff } }],
      deepDiveJobs: {
        none: {
          status: { in: ["QUEUED", "RUNNING"] },
        },
      },
    },
    include: {
      scan: {
        include: {
          account: true,
        },
      },
    },
    orderBy: [{ deepDiveFetchedAt: "asc" }, { score: "desc" }, { createdAt: "desc" }],
  });

  if (!duePost) return;

  await prisma.postDeepDiveJob.create({
    data: {
      ownerUserId: duePost.scan.account.ownerUserId,
      postSnapshotId: duePost.id,
      status: "QUEUED",
    },
  });
}

export async function GET(): Promise<NextResponse> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  await createDueJobIfNeeded(user.id);

  const job = await prisma.postDeepDiveJob.findFirst({
    where: {
      ownerUserId: user.id,
      OR: [
        { status: "QUEUED" },
        { status: "FAILED", error: { startsWith: "BROWSER_REQUIRED" } },
      ],
    },
    include: {
      post: {
        select: {
          id: true,
          redditId: true,
          title: true,
          subreddit: true,
          permalink: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!job) {
    return NextResponse.json({ job: null });
  }

  await prisma.postDeepDiveJob.update({
    where: { id: job.id },
    data: {
      status: "RUNNING",
      lockedAt: new Date(),
      startedAt: new Date(),
      attempts: { increment: 1 },
      error: null,
    },
  });

  return NextResponse.json({
    job: {
      id: job.id,
      redditId: job.post.redditId,
      title: job.post.title,
      subreddit: job.post.subreddit,
      permalink: job.post.permalink,
    },
  });
}
