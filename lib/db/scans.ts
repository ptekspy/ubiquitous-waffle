import type { Prisma } from "@prisma/client";

import { getMediaKey, getPostType } from "@/lib/content/post-classification";
import type { AccountAnalytics, RedditAccountData, RedditPost, SubredditMetric } from "@/lib/types";
import { prisma } from "./prisma";

export type SavedScan = {
  accountId: string;
  scanId: string;
};

type MediaGroupAccumulator = {
  mediaKey: string;
  postCount: number;
  totalScore: number;
  bestSubreddit: string | null;
  bestTitle: string | null;
  bestPostScore: number;
};

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function redditPostId(post: RedditPost): string {
  return post.id.startsWith("t3_") ? post.id : `t3_${post.id}`;
}

function buildMediaGroups(posts: RedditPost[]): MediaGroupAccumulator[] {
  const groups = new Map<string, MediaGroupAccumulator>();

  for (const post of posts) {
    const mediaKey = getMediaKey(post);
    if (!mediaKey) continue;

    const existing = groups.get(mediaKey) ?? {
      mediaKey,
      postCount: 0,
      totalScore: 0,
      bestSubreddit: null,
      bestTitle: null,
      bestPostScore: 0,
    };

    existing.postCount += 1;
    existing.totalScore += post.score;

    if (post.score >= existing.bestPostScore) {
      existing.bestSubreddit = post.subreddit;
      existing.bestTitle = post.title;
      existing.bestPostScore = post.score;
    }

    groups.set(mediaKey, existing);
  }

  return [...groups.values()].filter((group) => group.postCount > 1 || group.totalScore > 0);
}

function subredditSnapshotData(scanId: string, accountId: string, row: SubredditMetric) {
  return {
    scanId,
    accountId,
    subreddit: row.subreddit,
    posts: row.posts,
    comments: row.comments,
    totalScore: row.totalScore,
    averagePostScore: row.averagePostScore,
    averageCommentScore: row.averageCommentScore,
  };
}

export async function saveAccountScan(data: RedditAccountData, analytics: AccountAnalytics, ownerId?: string): Promise<SavedScan> {
  const existing = await prisma.redditAccount.findFirst({
    where: {
      ownerUserId: ownerId ?? null,
      username: data.profile.username,
    },
  });

  const account = existing
    ? await prisma.redditAccount.update({
        where: { id: existing.id },
        data: {
          redditId: data.profile.id,
          createdUtc: data.profile.createdUtc,
          totalKarma: data.profile.totalKarma,
          linkKarma: data.profile.linkKarma,
          commentKarma: data.profile.commentKarma,
          awardeeKarma: data.profile.awardeeKarma,
          awarderKarma: data.profile.awarderKarma,
          over18: data.profile.over18,
          iconUrl: data.profile.iconUrl,
        },
      })
    : await prisma.redditAccount.create({
        data: {
          ownerUserId: ownerId,
          redditId: data.profile.id,
          username: data.profile.username,
          createdUtc: data.profile.createdUtc,
          totalKarma: data.profile.totalKarma,
          linkKarma: data.profile.linkKarma,
          commentKarma: data.profile.commentKarma,
          awardeeKarma: data.profile.awardeeKarma,
          awarderKarma: data.profile.awarderKarma,
          over18: data.profile.over18,
          iconUrl: data.profile.iconUrl,
        },
      });

  if (ownerId) {
    await prisma.user.update({
      where: { id: ownerId },
      data: { redditUsername: data.profile.username },
    });
  }

  const scan = await prisma.accountScan.create({
    data: {
      accountId: account.id,
      source: data.source,
      capturedAt: toDate(data.capturedAt),
      rawPostCount: data.rawPostCount,
      rawCommentCount: data.rawCommentCount,
      cleanedPostCount: data.posts.length,
      cleanedCommentCount: data.comments.length,
      totalPostScore: analytics.summary.totalPostScore,
      totalCommentScore: analytics.summary.totalCommentScore,
      averagePostScore: analytics.summary.averagePostScore,
      averageCommentScore: analytics.summary.averageCommentScore,
      bestSubreddit: analytics.summary.bestSubreddit,
      bestPostingHourUtc: analytics.summary.bestPostingHourUtc,
      warnings: toInputJson(data.warnings),
      metadata: data.metadata ? toInputJson(data.metadata) : undefined,
      analytics: toInputJson(analytics),
    },
  });

  await prisma.postSnapshot.createMany({
    data: data.posts.map((post) => ({
      scanId: scan.id,
      accountId: account.id,
      redditId: redditPostId(post),
      title: post.title,
      subreddit: post.subreddit,
      permalink: post.permalink,
      url: post.url,
      createdUtc: post.createdUtc,
      score: post.score,
      numComments: post.numComments,
      upvoteRatio: post.upvoteRatio,
      linkFlairText: post.linkFlairText,
      over18: post.over18,
      isSelf: post.isSelf,
      domain: post.domain,
      postHint: post.postHint,
      contentType: getPostType(post),
      mediaKey: getMediaKey(post),
    })),
    skipDuplicates: true,
  });

  await prisma.commentSnapshot.createMany({
    data: data.comments.map((comment) => ({
      scanId: scan.id,
      accountId: account.id,
      redditId: comment.id.startsWith("t1_") ? comment.id : `t1_${comment.id}`,
      body: comment.body,
      subreddit: comment.subreddit,
      permalink: comment.permalink,
      createdUtc: comment.createdUtc,
      score: comment.score,
      linkTitle: comment.linkTitle,
    })),
    skipDuplicates: true,
  });

  await prisma.subredditSnapshot.createMany({
    data: analytics.subreddits.map((row) => subredditSnapshotData(scan.id, account.id, row)),
    skipDuplicates: true,
  });

  await prisma.mediaGroup.createMany({
    data: buildMediaGroups(data.posts).map((group) => ({
      scanId: scan.id,
      accountId: account.id,
      mediaKey: group.mediaKey,
      postCount: group.postCount,
      totalScore: group.totalScore,
      averageScore: Math.round((group.totalScore / group.postCount) * 10) / 10,
      bestSubreddit: group.bestSubreddit,
      bestTitle: group.bestTitle,
      bestPostScore: group.bestPostScore,
    })),
    skipDuplicates: true,
  });

  return {
    accountId: account.id,
    scanId: scan.id,
  };
}
