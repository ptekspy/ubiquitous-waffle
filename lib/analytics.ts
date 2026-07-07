import type {
  AccountAnalytics,
  ContentTypeMetric,
  RedditAccountData,
  RedditComment,
  RedditPost,
  SubredditMetric,
  TimelinePoint,
} from "./types";

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(total: number, count: number): number {
  return count === 0 ? 0 : round(total / count);
}

function dateKey(createdUtc: number): string {
  return new Date(createdUtc * 1000).toISOString().slice(0, 10);
}

function postingHourUtc(createdUtc: number): number {
  return new Date(createdUtc * 1000).getUTCHours();
}

function getPostType(post: RedditPost): string {
  const hint = post.postHint?.toLowerCase();
  const url = post.url?.toLowerCase() ?? "";
  const domain = post.domain?.toLowerCase() ?? "";

  if (post.isSelf) return "text";
  if (hint?.includes("video") || domain.includes("v.redd.it") || url.includes("redgifs.com")) return "video";
  if (hint?.includes("image") || /\.(jpg|jpeg|png|gif|webp)(\?|$)/.test(url)) return "image";
  if (domain.includes("reddit.com") && url.includes("/gallery/")) return "gallery";

  return "link";
}

function buildSubredditMetrics(posts: RedditPost[], comments: RedditComment[]): SubredditMetric[] {
  const rows = new Map<string, SubredditMetric>();

  for (const post of posts) {
    const existing = rows.get(post.subreddit) ?? {
      subreddit: post.subreddit,
      posts: 0,
      comments: 0,
      totalScore: 0,
      averagePostScore: 0,
      averageCommentScore: 0,
    };

    existing.posts += 1;
    existing.totalScore += post.score;
    existing.averagePostScore = average(
      posts.filter((item) => item.subreddit === post.subreddit).reduce((sum, item) => sum + item.score, 0),
      existing.posts,
    );
    rows.set(post.subreddit, existing);
  }

  for (const comment of comments) {
    const existing = rows.get(comment.subreddit) ?? {
      subreddit: comment.subreddit,
      posts: 0,
      comments: 0,
      totalScore: 0,
      averagePostScore: 0,
      averageCommentScore: 0,
    };

    existing.comments += 1;
    existing.totalScore += comment.score;
    existing.averageCommentScore = average(
      comments
        .filter((item) => item.subreddit === comment.subreddit)
        .reduce((sum, item) => sum + item.score, 0),
      existing.comments,
    );
    rows.set(comment.subreddit, existing);
  }

  return [...rows.values()].sort((a, b) => b.totalScore - a.totalScore).slice(0, 12);
}

function buildContentTypeMetrics(posts: RedditPost[]): ContentTypeMetric[] {
  const rows = new Map<string, ContentTypeMetric>();

  for (const post of posts) {
    const type = getPostType(post);
    const existing = rows.get(type) ?? { type, posts: 0, totalScore: 0, averageScore: 0 };
    existing.posts += 1;
    existing.totalScore += post.score;
    existing.averageScore = average(existing.totalScore, existing.posts);
    rows.set(type, existing);
  }

  return [...rows.values()].sort((a, b) => b.averageScore - a.averageScore);
}

function buildTimeline(posts: RedditPost[], comments: RedditComment[]): TimelinePoint[] {
  const rows = new Map<string, TimelinePoint>();

  for (const post of posts) {
    const key = dateKey(post.createdUtc);
    const existing = rows.get(key) ?? { date: key, posts: 0, comments: 0, score: 0 };
    existing.posts += 1;
    existing.score += post.score;
    rows.set(key, existing);
  }

  for (const comment of comments) {
    const key = dateKey(comment.createdUtc);
    const existing = rows.get(key) ?? { date: key, posts: 0, comments: 0, score: 0 };
    existing.comments += 1;
    existing.score += comment.score;
    rows.set(key, existing);
  }

  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
}

function bestPostingHour(posts: RedditPost[]): number | null {
  if (posts.length === 0) return null;

  const rows = new Map<number, { count: number; score: number }>();
  for (const post of posts) {
    const hour = postingHourUtc(post.createdUtc);
    const existing = rows.get(hour) ?? { count: 0, score: 0 };
    existing.count += 1;
    existing.score += post.score;
    rows.set(hour, existing);
  }

  return [...rows.entries()].sort(([, a], [, b]) => average(b.score, b.count) - average(a.score, a.count))[0]?.[0] ?? null;
}

function buildRecommendations(
  posts: RedditPost[],
  comments: RedditComment[],
  subreddits: SubredditMetric[],
  contentTypes: ContentTypeMetric[],
): string[] {
  const recommendations: string[] = [];
  const topSubreddit = subreddits[0];
  const topContentType = contentTypes[0];
  const topPost = [...posts].sort((a, b) => b.score - a.score)[0];

  if (topSubreddit && topSubreddit.posts > 0) {
    recommendations.push(`Double down on r/${topSubreddit.subreddit}; it has the strongest recent score signal.`);
  }

  if (topContentType) {
    recommendations.push(`${topContentType.type} posts are currently your best-performing format by average score.`);
  }

  if (topPost) {
    recommendations.push(`Use the style of your top post, “${topPost.title.slice(0, 80)}”, as the next content pattern to test.`);
  }

  if (posts.length < 10) {
    recommendations.push("There is not much public post history yet, so treat this as an early read rather than a final strategy.");
  }

  if (comments.length > posts.length * 3) {
    recommendations.push("Commenting activity is high versus posting volume; that can help account warmth before larger posts.");
  }

  return recommendations.slice(0, 5);
}

export function buildAccountAnalytics(data: RedditAccountData): AccountAnalytics {
  const { posts, comments } = data;
  const totalPostScore = posts.reduce((sum, post) => sum + post.score, 0);
  const totalCommentScore = comments.reduce((sum, comment) => sum + comment.score, 0);
  const subreddits = buildSubredditMetrics(posts, comments);
  const contentTypes = buildContentTypeMetrics(posts);
  const topPosts = [...posts].sort((a, b) => b.score - a.score).slice(0, 5);
  const topComments = [...comments].sort((a, b) => b.score - a.score).slice(0, 5);

  return {
    fetchedAt: new Date().toISOString(),
    summary: {
      posts: posts.length,
      comments: comments.length,
      totalPostScore,
      totalCommentScore,
      averagePostScore: average(totalPostScore, posts.length),
      averageCommentScore: average(totalCommentScore, comments.length),
      bestSubreddit: subreddits[0]?.subreddit ?? null,
      bestPostingHourUtc: bestPostingHour(posts),
    },
    topPosts,
    topComments,
    subreddits,
    contentTypes,
    timeline: buildTimeline(posts, comments),
    recommendations: buildRecommendations(posts, comments, subreddits, contentTypes),
  };
}
