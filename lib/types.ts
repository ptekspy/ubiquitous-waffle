export type JsonObject = Record<string, unknown>;

export type RedditProfile = {
  id: string;
  username: string;
  createdUtc: number | null;
  totalKarma: number;
  linkKarma: number;
  commentKarma: number;
  awardeeKarma: number;
  awarderKarma: number;
  followerCount?: number | null;
  over18: boolean;
  iconUrl: string | null;
};

export type RedditPost = {
  id: string;
  title: string;
  subreddit: string;
  permalink: string;
  url: string | null;
  createdUtc: number;
  score: number;
  numComments: number;
  upvoteRatio: number | null;
  linkFlairText: string | null;
  over18: boolean;
  isSelf: boolean;
  domain: string | null;
  postHint: string | null;
};

export type RedditComment = {
  id: string;
  body: string;
  subreddit: string;
  permalink: string;
  createdUtc: number;
  score: number;
  linkTitle: string | null;
};

export type RedditAccountData = {
  profile: RedditProfile;
  posts: RedditPost[];
  comments: RedditComment[];
  warnings: string[];
  source: string;
  capturedAt: string | null;
  metadata: JsonObject | null;
  rawPostCount: number;
  rawCommentCount: number;
};

export type SubredditMetric = {
  subreddit: string;
  posts: number;
  comments: number;
  totalScore: number;
  averagePostScore: number;
  averageCommentScore: number;
};

export type ContentTypeMetric = {
  type: string;
  posts: number;
  totalScore: number;
  averageScore: number;
};

export type TimelinePoint = {
  date: string;
  posts: number;
  comments: number;
  score: number;
};

export type AccountAnalytics = {
  fetchedAt: string;
  summary: {
    posts: number;
    comments: number;
    totalPostScore: number;
    totalCommentScore: number;
    averagePostScore: number;
    averageCommentScore: number;
    bestSubreddit: string | null;
    bestPostingHourUtc: number | null;
  };
  topPosts: RedditPost[];
  topComments: RedditComment[];
  subreddits: SubredditMetric[];
  contentTypes: ContentTypeMetric[];
  timeline: TimelinePoint[];
  recommendations: string[];
};

export type AccountMetricPoint = {
  capturedAt: string;
  totalKarma: number;
  linkKarma: number;
  commentKarma: number;
  awardeeKarma: number;
  awarderKarma: number;
  followerCount: number | null;
};

export type AccountMetricHistory = {
  window: "hour" | "day" | "week";
  points: AccountMetricPoint[];
};

export type PlannerJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export type PlannerJobSummary = {
  id: string;
  status: PlannerJobStatus;
  model: string | null;
  result: JsonObject | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AnalyzeResponse = {
  profile: RedditProfile;
  analytics: AccountAnalytics;
  warnings: string[];
  scanId?: string;
  plannerJob?: PlannerJobSummary | null;
};
