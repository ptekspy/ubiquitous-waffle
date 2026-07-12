import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { createDuePostDeepDiveJobs } from "@/lib/crawler/deep-dive-queue";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

type ErrorResponse = {
  error: string;
};

async function createDueJobIfNeeded(userId: string) {
  const existing = await prisma.postDeepDiveJob.findFirst({
    where: {
      ownerUserId: userId,
      OR: [{ status: "QUEUED" }, { status: "RUNNING" }, { status: "FAILED", error: { startsWith: "BROWSER_REQUIRED" } }],
    },
    select: { id: true },
  });

  if (existing) return;
  await createDuePostDeepDiveJobs(userId, 1);
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
