import { NextRequest, NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { savePostDeepDiveResult } from "@/lib/crawler/post-deep-dive";
import { prisma } from "@/lib/db/prisma";
import type { RedditPostDeepDive, RedditPostInsights, RedditThreadComment } from "@/lib/reddit";
import type { JsonObject, RedditPost } from "@/lib/types";

export const dynamic = "force-dynamic";

type ErrorResponse = {
  error: string;
};

type ImportBody = {
  jobId?: unknown;
  payload?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNumberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableStringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableJsonObject(value: unknown): JsonObject | null {
  return isRecord(value) ? value : null;
}

function toPost(value: unknown): RedditPost | null {
  if (!isRecord(value)) return null;

  const id = stringValue(value.id);
  const title = stringValue(value.title);
  const subreddit = stringValue(value.subreddit);
  const permalink = stringValue(value.permalink);

  if (!id || !title || !subreddit || !permalink) return null;

  return {
    id,
    title,
    subreddit,
    permalink,
    url: nullableStringValue(value.url),
    createdUtc: numberValue(value.createdUtc),
    score: numberValue(value.score),
    numComments: numberValue(value.numComments),
    upvoteRatio: nullableNumberValue(value.upvoteRatio),
    linkFlairText: nullableStringValue(value.linkFlairText),
    over18: Boolean(value.over18),
    isSelf: Boolean(value.isSelf),
    domain: nullableStringValue(value.domain),
    postHint: nullableStringValue(value.postHint),
  };
}

function toComment(value: unknown): RedditThreadComment | null {
  if (!isRecord(value)) return null;

  const redditId = stringValue(value.redditId);
  const body = stringValue(value.body);
  const subreddit = stringValue(value.subreddit);

  if (!redditId || !body || !subreddit) return null;

  return {
    redditId,
    parentRedditId: nullableStringValue(value.parentRedditId),
    author: nullableStringValue(value.author),
    body,
    subreddit,
    permalink: nullableStringValue(value.permalink),
    createdUtc: numberValue(value.createdUtc),
    score: numberValue(value.score),
    depth: numberValue(value.depth),
    isSubmitter: Boolean(value.isSubmitter),
    distinguished: nullableStringValue(value.distinguished),
  };
}

function toInsights(value: unknown): RedditPostInsights | null {
  if (!isRecord(value)) return null;

  return {
    viewCount: nullableNumberValue(value.viewCount),
    shareCount: nullableNumberValue(value.shareCount),
    source: stringValue(value.source) || "reddit-post-page",
    raw: nullableJsonObject(value.raw),
  };
}

function toDeepDive(value: unknown): RedditPostDeepDive | null {
  if (!isRecord(value)) return null;

  const post = toPost(value.post);
  if (!post) return null;

  const comments = Array.isArray(value.comments) ? value.comments.map(toComment).filter((comment): comment is RedditThreadComment => Boolean(comment)) : [];

  return {
    post,
    comments,
    rawCommentCount: numberValue(value.rawCommentCount, comments.length),
    insights: toInsights(value.insights),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  let body: ImportBody;

  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return NextResponse.json<ErrorResponse>({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (typeof body.jobId !== "string" || body.jobId.trim().length === 0) {
    return NextResponse.json<ErrorResponse>({ error: "jobId is required." }, { status: 400 });
  }

  const job = await prisma.postDeepDiveJob.findFirst({
    where: {
      id: body.jobId,
      ownerUserId: user.id,
    },
  });

  if (!job) {
    return NextResponse.json<ErrorResponse>({ error: "Crawler job not found." }, { status: 404 });
  }

  const deepDive = toDeepDive(body.payload);
  if (!deepDive) {
    return NextResponse.json<ErrorResponse>({ error: "Invalid post deep-dive payload." }, { status: 400 });
  }

  const saved = await savePostDeepDiveResult(job.id, deepDive);
  return NextResponse.json({ ok: true, comments: saved.comments });
}
