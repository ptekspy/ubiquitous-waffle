import type { RedditAccountData, RedditComment, RedditPost, RedditProfile } from "./types";

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

export type RedditPostDeepDive = {
  post: RedditPost;
  comments: RedditThreadComment[];
  rawCommentCount: number;
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
      label: "api.reddit.com api-style json",
      url: `https://api.reddit.com${apiRedditPath(path)}`,
      headers: apiHeaders(),
    },
    {
      label: "api.reddit.com browser-style json",
      url: `https://api.reddit.com${apiRedditPath(path)}`,
      headers: browserHeaders(),
    },
  ];
}

function errorMessageForStatus(status: number): string {
  if (status === 403) {
    return "Reddit blocked the public JSON request with a 403.";
  }

  if (status === 404) {
    return "Reddit account not found or not publicly available.";
  }

  if (status === 429) {
    return "Reddit rate limited the request. Try again shortly.";
  }

  return `Reddit returned ${status}.`;
}

export async function redditFetch<T>(path: string): Promise<T> {
  const failures: FetchFailure[] = [];

  for (const attempt of buildFetchAttempts(path)) {
    const response = await fetch(attempt.url, {
      cache: "no-store",
      headers: attempt.headers,
    });

    const body = await response.text();

    if (!response.ok) {
      failures.push({
        label: attempt.label,
        status: response.status,
        body: body.slice(0, 240),
      });
      continue;
    }

    try {
      return JSON.parse(body) as T;
    } catch {
      failures.push({
        label: attempt.label,
        status: 502,
        body: body.slice(0, 240),
      });
    }
  }

  const lastFailure = failures.at(-1);
  const status = lastFailure?.status ?? 500;

  if (process.env.REDDIT_DEBUG === "1") {
    console.warn("Reddit fetch failed", { path, failures });
  }

  throw new RedditFetchError(errorMessageForStatus(status), status, failures);
}

function toProfile(username: string, raw: RawProfile): RedditProfile {
  return {
    id: raw.id ?? username,
    username: raw.name ?? username,
    createdUtc: raw.created_utc ?? null,
    totalKarma: raw.total_karma ?? (raw.link_karma ?? 0) + (raw.comment_karma ?? 0),
    linkKarma: raw.link_karma ?? 0,
    commentKarma: raw.comment_karma ?? 0,
    awardeeKarma: raw.awardee_karma ?? 0,
    awarderKarma: raw.awarder_karma ?? 0,
    over18: raw.over_18 ?? false,
    iconUrl: raw.icon_img || null,
  };
}

function toPost(raw: RawPost): RedditPost {
  return {
    id: raw.id,
    title: raw.title ?? "Untitled post",
    subreddit: raw.subreddit ?? "unknown",
    permalink: raw.permalink ? `https://www.reddit.com${raw.permalink}` : "https://www.reddit.com",
    url: raw.url ?? null,
    createdUtc: raw.created_utc ?? 0,
    score: raw.score ?? 0,
    numComments: raw.num_comments ?? 0,
    upvoteRatio: raw.upvote_ratio ?? null,
    linkFlairText: raw.link_flair_text ?? null,
    over18: raw.over_18 ?? false,
    isSelf: raw.is_self ?? false,
    domain: raw.domain ?? null,
    postHint: raw.post_hint ?? null,
  };
}

function toComment(raw: RawComment): RedditComment {
  return {
    id: raw.id,
    body: raw.body ?? "",
    subreddit: raw.subreddit ?? "unknown",
    permalink: raw.permalink ? `https://www.reddit.com${raw.permalink}` : "https://www.reddit.com",
    createdUtc: raw.created_utc ?? 0,
    score: raw.score ?? 0,
    linkTitle: raw.link_title ?? null,
  };
}

function toThreadComment(raw: RawThreadComment, fallbackSubreddit: string, depth: number): RedditThreadComment {
  return {
    redditId: raw.id.startsWith("t1_") ? raw.id : `t1_${raw.id}`,
    parentRedditId: raw.parent_id ?? null,
    author: raw.author ?? null,
    body: raw.body ?? "",
    subreddit: raw.subreddit ?? fallbackSubreddit,
    permalink: raw.permalink ? `https://www.reddit.com${raw.permalink}` : null,
    createdUtc: raw.created_utc ?? 0,
    score: raw.score ?? 0,
    depth: raw.depth ?? depth,
    isSubmitter: raw.is_submitter ?? false,
    distinguished: raw.distinguished ?? null,
  };
}

function flattenThreadComments(children: Array<RedditApiResponse<RawThreadComment>>, fallbackSubreddit: string, depth = 0): RedditThreadComment[] {
  const comments: RedditThreadComment[] = [];

  for (const child of children) {
    if (child.kind !== "t1") continue;

    comments.push(toThreadComment(child.data, fallbackSubreddit, depth));

    const replies = child.data.replies;
    if (typeof replies === "object" && replies?.data?.children) {
      comments.push(...flattenThreadComments(replies.data.children, fallbackSubreddit, depth + 1));
    }
  }

  return comments;
}

async function fetchListing<T>(username: string, listing: "submitted" | "comments"): Promise<{ items: T[]; warning: string | null }> {
  const params = new URLSearchParams({
    limit: String(MAX_LISTING_ITEMS),
    raw_json: "1",
  });

  try {
    const response = await redditFetch<ListingResponse<T>>(`/user/${username}/${listing}.json?${params}`);
    return {
      items: response.data.children.map((child) => child.data),
      warning: null,
    };
  } catch (error) {
    if (error instanceof RedditFetchError && [403, 404, 429].includes(error.status)) {
      return {
        items: [],
        warning: `${listing} import skipped: ${error.message}`,
      };
    }

    throw error;
  }
}

export async function fetchRedditPostDeepDive(postId: string): Promise<RedditPostDeepDive> {
  const cleanId = postId.replace(/^t3_/, "");
  const params = new URLSearchParams({
    limit: String(MAX_THREAD_COMMENTS),
    raw_json: "1",
    sort: "top",
  });
  const response = await redditFetch<[ListingResponse<RawPost>, ListingResponse<RawThreadComment>]>(`/comments/${cleanId}.json?${params}`);
  const rawPost = response[0]?.data?.children?.[0]?.data;

  if (!rawPost) {
    throw new RedditFetchError("Reddit post not found or not publicly available.", 404);
  }

  const post = toPost(rawPost);
  const comments = flattenThreadComments(response[1]?.data?.children ?? [], post.subreddit).filter((comment) => comment.createdUtc > 0);

  return {
    post,
    comments,
    rawCommentCount: response[1]?.data?.children?.length ?? 0,
  };
}

export async function fetchRedditAccountData(input: string): Promise<RedditAccountData> {
  const username = normaliseUsername(input);
  const profileResponse = await redditFetch<RedditApiResponse<RawProfile>>(
    `/user/${username}/about.json?raw_json=1`,
  );

  const [submitted, comments] = await Promise.all([
    fetchListing<RawPost>(username, "submitted"),
    fetchListing<RawComment>(username, "comments"),
  ]);
  const posts = submitted.items.map(toPost).filter((post) => post.createdUtc > 0);
  const parsedComments = comments.items.map(toComment).filter((comment) => comment.createdUtc > 0);

  return {
    profile: toProfile(username, profileResponse.data),
    posts,
    comments: parsedComments,
    source: "server-reddit-json",
    capturedAt: null,
    metadata: null,
    rawPostCount: submitted.items.length,
    rawCommentCount: comments.items.length,
    warnings: [submitted.warning, comments.warning].filter((warning): warning is string => Boolean(warning)),
  };
}
