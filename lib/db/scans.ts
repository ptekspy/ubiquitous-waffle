import type { Prisma } from "@prisma/client";

import { getMediaKey, getPostType } from "@/lib/content/post-classification";
import { syncDareCompletionsForScan } from "@/lib/dares/tracker";
import { syncPlannedPostsForScan } from "@/lib/product/ops";
import { ensureProductOpsTables } from "@/lib/product/schema";
import type { AccountAnalytics, RedditAccountData, RedditPost, SubredditMetric } from "@/lib/types";
import { prisma } from "./prisma";

export type SavedScan = {
  accountId: string;
  scanId: string;
};

export type SaveAccountScanOptions = {
  enqueueDeepDiveJobs?: boolean;
};

type MediaGroupAccumulator = {
  mediaKey: string;
  postCount: number;
  totalScore: number;
  bestSubreddit: string | null;
  bestTitle: string | null;
  bestPostScore: number;
};

type SubredditLookup = Map<string, string>;

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

function subredditKey(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueSubreddits(data: RedditAccountData, analytics: AccountAnalytics): string[] {
  const names = new Set<string>();

  for (const post of data.posts) names.add(post.subreddit);
  for (const comment of data.comments) names.add(comment.subreddit);
  for (const row of analytics.subreddits) names.add(row.subreddit);

  return [...names].map((name) => name.trim()).filter(Boolean);
}

async function upsertSubreddits(names: string[]): Promise<SubredditLookup> {
  if (names.length === 0) return new Map();

  await prisma.subreddit.createMany({
    data: names.map((name) => ({
      name: subredditKey(name),
      displayName: name,
    })),
    skipDuplicates: true,
  });

  const rows = await prisma.subreddit.findMany({
    where: {
      name: {
        in: names.map(subredditKey),
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  return new Map(rows.map((row) => [row.name, row.id]));
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

function subredditSnapshotData(scanId: string, accountId: string, row: SubredditMetric, subredditLookup: SubredditLookup) {
  return {
    scanId,
    accountId,
    subredditId: subredditLookup.get(subredditKey(row.subreddit)),
    subreddit: row.subreddit,
    posts: row.posts,
    comments: row.comments,
    totalScore: row.totalScore,
    averagePostScore: row.averagePostScore,
    averageCommentScore: row.averageCommentScore,
  };
}

async function enqueuePostDeepDiveJobs(scanId: string, ownerId?: string): Promise<void> {
  const posts = await prisma.postSnapshot.findMany({
    where: { scanId },
    select: { id: true },
  });

  if (posts.length === 0) return;

  await prisma.postDeepDiveJob.createMany({
    data: posts.map((post) => ({
      ownerUserId: ownerId,
      postSnapshotId: post.id,
      status: "QUEUED",
    })),
  });
}

export async function saveAccountScan(data: RedditAccountData, analytics: AccountAnalytics, ownerId?: string, options: SaveAccountScanOptions = {}): Promise<SavedScan> {
  const subredditLookup = await upsertSubreddits(uniqueSubreddits(data, analytics));
  const existing = await prisma.redditAccount.findFirst({
    where: {
      ownerUserId: ownerId ?? null,
      username: data.profile.username,
    },
  });

  const profileData = {
    redditId: data.profile.id,
    createdUtc: data.profile.createdUtc,
    totalKarma: data.profile.totalKarma,
    linkKarma: data.profile.linkKarma,
    commentKarma: data.profile.commentKarma,
    awardeeKarma: data.profile.awardeeKarma,
    awarderKarma: data.profile.awarderKarma,
    followerCount: data.profile.followerCount ?? null,
    over18: data.profile.over18,
    iconUrl: data.profile.iconUrl,
  };

  const account = existing
    ? await prisma.redditAccount.update({
        where: { id: existing.id },
        data: profileData,
      })
    : await prisma.redditAccount.create({
        data: {
          ownerUserId: ownerId,
          username: data.profile.username,
          ...profileData,
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

  await prisma.accountMetricSnapshot.create({
    data: {
      accountId: account.id,
      scanId: scan.id,
      source: data.source,
      totalKarma: data.profile.totalKarma,
      linkKarma: data.profile.linkKarma,
      commentKarma: data.profile.commentKarma,
      awardeeKarma: data.profile.awardeeKarma,
      awarderKarma: data.profile.awarderKarma,
      followerCount: data.profile.followerCount ?? null,
    },
  });

  await prisma.postSnapshot.createMany({
    data: data.posts.map((post) => ({
      scanId: scan.id,
      accountId: account.id,
      subredditId: subredditLookup.get(subredditKey(post.subreddit)),
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
      subredditId: subredditLookup.get(subredditKey(comment.subreddit)),
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
    data: analytics.subreddits.map((row) => subredditSnapshotData(scan.id, account.id, row, subredditLookup)),
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

  await syncDareCompletionsForScan(scan.id, account.id, ownerId ?? null);

  if (ownerId) {
    await ensureProductOpsTables();
    await syncPlannedPostsForScan(scan.id, account.id, ownerId);
  }

  if (options.enqueueDeepDiveJobs ?? true) {
    await enqueuePostDeepDiveJobs(scan.id, ownerId);
  }

  return {
    accountId: account.id,
    scanId: scan.id,
  };
}
