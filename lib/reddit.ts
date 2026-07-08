import type { JsonObject, RedditAccountData, RedditComment, RedditPost, RedditProfile } from "./types";

const DEFAULT_USER_AGENT = "web:paidpolitely.reddit-analytics:v0.3.0 (by /u/ptekspy)";
const DEFAULT_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const MAX_LISTING_ITEMS = 100;
const MAX_THREAD_COMMENTS = 500;

type RedditApiResponse<T> = {
  kind: string;
  data: T;
};

type ListingResponse<T> = RedditApiResponse<{
  after: string | null;
  children: Array<RedditApiResponse<T>>;
}>;

type RawProfile = {
  id?: string;
  name?: string;
  created_utc?: number;
  total_karma?: number;
  link_karma?: number;
  comment_karma?: number;
  awardee_karma?: number;
  awarder_karma?: number;
  over_18?: boolean;
  icon_img?: string;
  subreddit?: {
    subscribers?: number;
  };
};

type RawPost = {
  id: string;
  title?: string;
  subreddit?: string;
  permalink?: string;
  url?: string;
  created_utc?: number;
  score?: number;
  num_comments?: number;
  upvote_ratio?: number;
  link_flair_text?: string;
  over_18?: boolean;
  is_self?: boolean;
  domain?: string;
  post_hint?: string;
};

type RawComment = {
  id: string;
  body?: string;
  subreddit?: string;
  permalink?: string;
  created_utc?: number;
  score?: number;
  link_title?: string;
};

type RawThreadComment = RawComment & {
  author?: string;
  parent_id?: string;
  replies?: "" | ListingResponse<RawThreadComment>;
  depth?: number;
  is_submitter?: boolean;
  distinguished?: string | null;
};

type FetchAttempt = {
  label: string;
  url: string;
  headers: HeadersInit;
};

type FetchFailure = {
  label: string;
  status: number;
  body: string;
};

export type RedditThreadComment = {
  redditId: string;
  parentRedditId: string | null;
  author: string | null;
  body: string;
  subreddit: string;
  permalink: string | null;
  createdUtc: number;
  score: number;
  depth: number;
  isSubmitter: boolean;
  distinguished: string | null;
};

export type RedditPostInsights = {
  viewCount: number | null;
  shareCount: number | null;
  source: string;
  raw: JsonObject | null;
};

export type RedditPostDeepDive = {
  post: RedditPost;
  comments: RedditThreadComment[];
  rawCommentCount: number;
  insights?: RedditPostInsights | null;
};

export class RedditFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly failures: FetchFailure[] = [],
  ) {
    super(message);
    this.name = "RedditFetchError";
  }
}

export function normaliseUsername(input: string): string {
  const trimmed = input.trim();
  const withoutUrl = trimmed
    .replace(/^https?:\/\/(www\.)?reddit\.com\/user\//i, "")
    .replace(/^https?:\/\/(www\.)?reddit\.com\/u\//i, "")
    .replace(/^u\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0];

  if (!/^[A-Za-z0-9_-]{3,20}$/.test(withoutUrl)) {
    throw new RedditFetchError("Enter a valid Reddit username.", 400);
  }

  return withoutUrl;
}

function apiHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    "Accept-Language": "en-GB,en;q=0.9",
    "User-Agent": process.env.REDDIT_USER_AGENT || DEFAULT_USER_AGENT,
  };
}

function browserHeaders(): HeadersInit {
  return {
    Accept: "application/json,text/plain,*/*",
    "Accept-Language": "en-GB,en;q=0.9",
    Referer: "https://www.reddit.com/",
    "User-Agent": process.env.REDDIT_BROWSER_USER_AGENT || DEFAULT_BROWSER_USER_AGENT,
  };
}

function apiRedditPath(path: string): string {
  return path.replace(/\.json(?=[?#]|$)/, "");
}

function buildFetchAttempts(path: string): FetchAttempt[] {
  return [
    {
      label: "www.reddit.com api-style json",
      url: `https://www.reddit.com${path}`,
      headers: apiHeaders(),
    },
    {
      label: "www.reddit.com browser-style json",
      url: `https://www.reddit.com${path}`,
      headers: browserHeaders(),
    },
    {
      label: "oauth.reddit.com api path",
      url: `https://oauth.reddit.com${apiRedditPath(path)}`,
      headers: apiHeaders(),
    },
  ];
}

async function fetchRedditJson<T>(path: string): Promise<T> {
  const attempts = buildFetchAttempts(path);
  const failures: FetchFailure[] = [];

  for (const attempt of attempts) {
    const response = await fetch(attempt.url, {
      headers: attempt.headers,
      cache: "no-store",
    });

    if (response.ok) return (await response.json()) as T;

    failures.push({
      label: attempt.label,
      status: response.status,
      body: await response.text().catch(() => ""),
    });
  }

  throw new RedditFetchError("Reddit could not be reached with any supported JSON endpoint.", failures[0]?.status ?? 500, failures);
}

function compactUrl(value: string | undefined): string {
  if (!value) return "";
  if (value.startsWith("http")) return value;
  return `https://www.reddit.com${value}`;
}

function toPost(child: RedditApiResponse<RawPost>): RedditPost | null {
  const data = child.data;
  if (!data?.id || !data.title || !data.subreddit || !data.permalink) return null;

  return {
    id: data.id.startsWith("t3_") ? data.id : `t3_${data.id}`,
    title: data.title,
    subreddit: data.subreddit,
    permalink: compactUrl(data.permalink),
    url: data.url ?? null,
    createdUtc: data.created_utc ?? 0,
    score: data.score ?? 0,
    numComments: data.num_comments ?? 0,
    upvoteRatio: typeof data.upvote_ratio === "number" ? data.upvote_ratio : null,
    linkFlairText: data.link_flair_text ?? null,
    over18: Boolean(data.over_18),
    isSelf: Boolean(data.is_self),
    domain: data.domain ?? null,
    postHint: data.post_hint ?? null,
  };
}

function toComment(child: RedditApiResponse<RawComment>): RedditComment | null {
  const data = child.data;
  if (!data?.id || !data.body || !data.subreddit || !data.permalink) return null;

  return {
    id: data.id.startsWith("t1_") ? data.id : `t1_${data.id}`,
    body: data.body,
    subreddit: data.subreddit,
    permalink: compactUrl(data.permalink),
    createdUtc: data.created_utc ?? 0,
    score: data.score ?? 0,
    linkTitle: data.link_title ?? null,
  };
}

function toProfile(data: RawProfile, username: string): RedditProfile {
  const linkKarma = data.link_karma ?? 0;
  const commentKarma = data.comment_karma ?? 0;

  return {
    id: data.id ?? username,
    username: data.name ?? username,
    createdUtc: data.created_utc ?? null,
    totalKarma: data.total_karma ?? linkKarma + commentKarma,
    linkKarma,
    commentKarma,
    awardeeKarma: data.awardee_karma ?? 0,
    awarderKarma: data.awarder_karma ?? 0,
    followerCount: null,
    over18: Boolean(data.over_18),
    iconUrl: data.icon_img ?? null,
  };
}

function flattenComments(children: Array<RedditApiResponse<RawThreadComment>>, fallbackSubreddit: string, depth = 0): RedditThreadComment[] {
  const comments: RedditThreadComment[] = [];

  for (const child of children) {
    if (child.kind !== "t1") continue;
    const data = child.data;
    if (!data?.id || !data.body) continue;

    comments.push({
      redditId: data.id.startsWith("t1_") ? data.id : `t1_${data.id}`,
      parentRedditId: data.parent_id ?? null,
      author: data.author ?? null,
      body: data.body,
      subreddit: data.subreddit ?? fallbackSubreddit,
      permalink: data.permalink ? compactUrl(data.permalink) : null,
      createdUtc: data.created_utc ?? 0,
      score: data.score ?? 0,
      depth: data.depth ?? depth,
      isSubmitter: Boolean(data.is_submitter),
      distinguished: data.distinguished ?? null,
    });

    if (typeof data.replies === "object" && Array.isArray(data.replies.data.children)) {
      comments.push(...flattenComments(data.replies.data.children, fallbackSubreddit, depth + 1));
    }
  }

  return comments;
}

export async function fetchRedditAccountData(username: string): Promise<RedditAccountData> {
  const profile = await fetchRedditJson<RedditApiResponse<RawProfile>>(`/user/${username}/about.json?raw_json=1`);
  const submitted = await fetchRedditJson<ListingResponse<RawPost>>(`/user/${username}/submitted.json?limit=${MAX_LISTING_ITEMS}&raw_json=1`);
  const comments = await fetchRedditJson<ListingResponse<RawComment>>(`/user/${username}/comments.json?limit=${MAX_LISTING_ITEMS}&raw_json=1`);

  const posts = submitted.data.children.map(toPost).filter((post): post is RedditPost => Boolean(post));
  const commentRows = comments.data.children.map(toComment).filter((comment): comment is RedditComment => Boolean(comment));

  return {
    profile: toProfile(profile.data, username),
    posts,
    comments: commentRows,
    warnings: [],
    source: "reddit-json",
    capturedAt: new Date().toISOString(),
    metadata: null,
    rawPostCount: submitted.data.children.length,
    rawCommentCount: comments.data.children.length,
  };
}

export async function fetchRedditPostDeepDive(redditId: string): Promise<RedditPostDeepDive> {
  const cleanId = redditId.replace(/^t3_/, "");
  const thread = await fetchRedditJson<[ListingResponse<RawPost>, ListingResponse<RawThreadComment>]>(`/comments/${cleanId}.json?limit=${MAX_THREAD_COMMENTS}&sort=top&raw_json=1`);
  const postChild = thread[0]?.data?.children?.[0];
  const post = postChild ? toPost(postChild) : null;

  if (!post) throw new RedditFetchError("Reddit did not return a usable post thread.", 404);

  return {
    post,
    comments: flattenComments(thread[1]?.data?.children ?? [], post.subreddit),
    rawCommentCount: thread[1]?.data?.children?.length ?? 0,
    insights: null,
  };
}
