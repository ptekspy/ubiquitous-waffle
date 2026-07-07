import type { RedditAccountData, RedditComment, RedditPost, RedditProfile } from "./types";

const DEFAULT_USER_AGENT = "web:paidpolitely.reddit-analytics:v0.1.2 (by /u/ptekspy)";
const DEFAULT_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const MAX_LISTING_ITEMS = 100;

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

async function redditFetch<T>(path: string): Promise<T> {
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

export async function fetchRedditAccountData(input: string): Promise<RedditAccountData> {
  const username = normaliseUsername(input);
  const profileResponse = await redditFetch<RedditApiResponse<RawProfile>>(
    `/user/${username}/about.json?raw_json=1`,
  );

  const [submitted, comments] = await Promise.all([
    fetchListing<RawPost>(username, "submitted"),
    fetchListing<RawComment>(username, "comments"),
  ]);

  return {
    profile: toProfile(username, profileResponse.data),
    posts: submitted.items.map(toPost).filter((post) => post.createdUtc > 0),
    comments: comments.items.map(toComment).filter((comment) => comment.createdUtc > 0),
    warnings: [submitted.warning, comments.warning].filter((warning): warning is string => Boolean(warning)),
  };
}
