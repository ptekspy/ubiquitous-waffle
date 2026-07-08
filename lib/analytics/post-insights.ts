import { prisma } from "@/lib/db/prisma";
import type { PostInsightsResponse } from "@/lib/types";

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanRedditId(value: string): string {
  return value.replace(/^t3_/, "");
}

export async function getPostInsights(ownerUserId: string): Promise<PostInsightsResponse> {
  const account = await prisma.redditAccount.findFirst({
    where: { ownerUserId },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (!account) return { generatedAt: new Date().toISOString(), rows: [] };

  const posts = await prisma.postSnapshot.findMany({
    where: { accountId: account.id },
    orderBy: [{ latestInsightAt: "desc" }, { deepDiveFetchedAt: "desc" }, { score: "desc" }],
    take: 30,
    select: {
      id: true,
      redditId: true,
      title: true,
      subreddit: true,
      permalink: true,
      createdUtc: true,
      score: true,
      numComments: true,
      refreshedScore: true,
      refreshedNumComments: true,
      latestViewCount: true,
      latestShareCount: true,
      latestInsightAt: true,
      metricSnapshots: {
        orderBy: { capturedAt: "asc" },
        take: 80,
        select: {
          capturedAt: true,
          score: true,
          numComments: true,
          upvoteRatio: true,
          estimatedUpvotes: true,
          estimatedDownvotes: true,
          viewCount: true,
          shareCount: true,
        },
      },
    },
  });

  return {
    generatedAt: new Date().toISOString(),
    rows: posts.map((post) => ({
      id: post.id,
      redditId: cleanRedditId(post.redditId),
      title: post.title,
      subreddit: post.subreddit,
      permalink: post.permalink,
      createdAt: new Date(post.createdUtc * 1000).toISOString(),
      score: post.score,
      comments: post.numComments,
      latestScore: post.refreshedScore,
      latestComments: post.refreshedNumComments,
      latestViews: post.latestViewCount,
      latestShares: post.latestShareCount,
      latestInsightAt: iso(post.latestInsightAt),
      history: post.metricSnapshots.map((metric) => ({
        capturedAt: metric.capturedAt.toISOString(),
        score: metric.score,
        comments: metric.numComments,
        upvoteRatio: metric.upvoteRatio,
        estimatedUpvotes: metric.estimatedUpvotes,
        estimatedDownvotes: metric.estimatedDownvotes,
        viewCount: metric.viewCount,
        shareCount: metric.shareCount,
      })),
    })),
  };
}
