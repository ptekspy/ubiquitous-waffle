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

export type AccountMetricEvent = {
  id: string;
  capturedAt: string;
  type: "post" | "scan" | "spike";
  label: string;
  detail: string;
  value?: number | null;
};

export type AccountMetricHistory = {
  window: "hour" | "day" | "week";
  points: AccountMetricPoint[];
  events?: AccountMetricEvent[];
};

export type PostInsightPoint = {
  capturedAt: string;
  score: number;
  comments: number;
  upvoteRatio: number | null;
  estimatedUpvotes: number | null;
  estimatedDownvotes: number | null;
  viewCount: number | null;
  shareCount: number | null;
};

export type PostInsightRow = {
  id: string;
  redditId: string;
  title: string;
  subreddit: string;
  permalink: string;
  createdAt: string;
  score: number;
  comments: number;
  latestScore: number | null;
  latestComments: number | null;
  latestViews: number | null;
  latestShares: number | null;
  latestInsightAt: string | null;
  history: PostInsightPoint[];
};

export type PostInsightsResponse = {
  generatedAt: string;
  rows: PostInsightRow[];
};

export type InsightSeverity = "good" | "watch" | "neutral";

export type DashboardInsight = {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  timestamp: string;
};

export type PostImpactRow = {
  id: string;
  title: string;
  subreddit: string;
  permalink: string;
  createdAt: string;
  score: number;
  comments: number;
  refreshedScore: number | null;
  refreshedComments: number | null;
  followerGain: number | null;
  karmaGain: number | null;
  impactScore: number;
  confidence: "low" | "medium" | "high";
};

export type SubredditRoiRow = {
  subreddit: string;
  posts: number;
  comments: number;
  totalScore: number;
  averagePostScore: number;
  averageCommentScore: number;
  followerGain: number | null;
  roiScore: number;
  recommendation: "double-down" | "test-more" | "pause";
};

export type PostingHeatmapCell = {
  day: number;
  dayLabel: string;
  hour: number;
  posts: number;
  totalScore: number;
  averageScore: number;
  totalComments: number;
};

export type DashboardInsightsResponse = {
  generatedAt: string;
  account: {
    id: string;
    username: string;
  } | null;
  insights: DashboardInsight[];
  postImpacts: PostImpactRow[];
  subredditRoi: SubredditRoiRow[];
  heatmap: PostingHeatmapCell[];
  events: AccountMetricEvent[];
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
