import type { RedditAccountData, RedditComment, RedditPost, RedditProfile } from "./types";

const REDDIT_BASE_URL = "https://www.reddit.com";
const DEFAULT_USER_AGENT = "PaidPolitelyAnalytics/0.1.0 (+https://paidpolitely.com)";
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

export class RedditFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
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

async function redditFetch<T>(path: string): Promise<T> {
  const userAgent = process.env.REDDIT_USER_AGENT || DEFAULT_USER_AGENT;
  const response = await fetch(`${REDDIT_BASE_URL}${path}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent,
    },
  });

  if (response.status === 404) {
    throw new RedditFetchError("Reddit account not found or not publicly available.", 404);
  }

  if (response.status === 429) {
    throw new RedditFetchError("Reddit rate limited the request. Try again shortly.", 429);
  }

  if (!response.ok) {
    throw new RedditFetchError(`Reddit returned ${response.status}.`, response.status);
  }

  return (await response.json()) as T;
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

async function fetchListing<T>(username: string, listing: "submitted" | "comments"): Promise<T[]> {
  const params = new URLSearchParams({
    limit: String(MAX_LISTING_ITEMS),
    raw_json: "1",
  });

  const response = await redditFetch<ListingResponse<T>>(`/user/${username}/${listing}.json?${params}`);
  return response.data.children.map((child) => child.data);
}

export async function fetchRedditAccountData(input: string): Promise<RedditAccountData> {
  const username = normaliseUsername(input);
  const profileResponse = await redditFetch<RedditApiResponse<RawProfile>>(
    `/user/${username}/about.json?raw_json=1`,
  );

  const [rawPosts, rawComments] = await Promise.all([
    fetchListing<RawPost>(username, "submitted"),
    fetchListing<RawComment>(username, "comments"),
  ]);

  return {
    profile: toProfile(username, profileResponse.data),
    posts: rawPosts.map(toPost).filter((post) => post.createdUtc > 0),
    comments: rawComments.map(toComment).filter((comment) => comment.createdUtc > 0),
  };
}
