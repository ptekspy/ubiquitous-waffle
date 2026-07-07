import type { RedditAccountData, RedditComment, RedditPost, RedditProfile } from "./types";

type BrowserImportPost = {
  id?: unknown;
  title?: unknown;
  subreddit?: unknown;
  permalink?: unknown;
  url?: unknown;
  createdUtc?: unknown;
  score?: unknown;
  numComments?: unknown;
  postHint?: unknown;
};

type BrowserImportComment = {
  id?: unknown;
  body?: unknown;
  subreddit?: unknown;
  permalink?: unknown;
  createdUtc?: unknown;
  score?: unknown;
  linkTitle?: unknown;
};

type BrowserImportProfile = {
  id?: unknown;
  username?: unknown;
  createdUtc?: unknown;
  totalKarma?: unknown;
  linkKarma?: unknown;
  commentKarma?: unknown;
  over18?: unknown;
  iconUrl?: unknown;
};

type BrowserImportPayload = {
  source?: unknown;
  capturedAt?: unknown;
  profile?: BrowserImportProfile;
  username?: unknown;
  posts?: BrowserImportPost[];
  comments?: BrowserImportComment[];
};

export class BrowserImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserImportError";
  }
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalised = value.trim().toLowerCase().replace(/,/g, "");
    const multiplier = normalised.endsWith("k") ? 1_000 : normalised.endsWith("m") ? 1_000_000 : 1;
    const parsed = Number.parseFloat(normalised.replace(/[km]$/, ""));
    if (Number.isFinite(parsed)) return Math.round(parsed * multiplier);
  }
  return fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function absoluteRedditUrl(value: unknown): string {
  const raw = asString(value, "https://www.reddit.com");
  if (raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return `https://www.reddit.com${raw}`;
  return `https://www.reddit.com/${raw}`;
}

function normaliseUsername(value: unknown): string {
  const username = asString(value).replace(/^u\//i, "").replace(/^@/, "");
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(username)) {
    throw new BrowserImportError("Browser import needs a valid Reddit username.");
  }
  return username;
}

function subredditFromPermalink(value: unknown): string {
  const permalink = asString(value);
  return permalink.match(/\/r\/([^/]+)\//i)?.[1] ?? "";
}

function redditIdFromPermalink(value: unknown): string {
  const permalink = asString(value);
  const id = permalink.match(/\/comments\/([^/]+)\//i)?.[1];
  return id ? `t3_${id}` : "";
}

function cleanSubreddit(rawSubreddit: unknown, title: string, permalink: unknown, username: string): string {
  const fromPermalink = subredditFromPermalink(permalink);
  const fromPayload = asString(rawSubreddit).replace(/^r\//i, "");

  if (fromPermalink) return fromPermalink;
  if (fromPayload && fromPayload !== title) return fromPayload;
  if (asString(permalink).match(/\/user\/[^/]+\/comments\//i)) return `u_${username}`;

  return "";
}

function toProfile(payload: BrowserImportPayload): RedditProfile {
  const profile = payload.profile ?? {};
  const username = normaliseUsername(profile.username ?? payload.username);
  const linkKarma = asNumber(profile.linkKarma, 0);
  const commentKarma = asNumber(profile.commentKarma, 0);
  const totalKarma = asNumber(profile.totalKarma, linkKarma + commentKarma);

  return {
    id: asString(profile.id, username),
    username,
    createdUtc: asNumber(profile.createdUtc, 0) || null,
    totalKarma,
    linkKarma,
    commentKarma,
    awardeeKarma: 0,
    awarderKarma: 0,
    over18: asBoolean(profile.over18, false),
    iconUrl: asString(profile.iconUrl) || null,
  };
}

function toPost(raw: BrowserImportPost, index: number, username: string): RedditPost | null {
  const title = asString(raw.title);
  const subreddit = cleanSubreddit(raw.subreddit, title, raw.permalink, username);
  const permalink = absoluteRedditUrl(raw.permalink);

  if (!title || !subreddit || permalink === "https://www.reddit.com") return null;

  return {
    id: redditIdFromPermalink(raw.permalink) || asString(raw.id, `browser-post-${index}`),
    title,
    subreddit,
    permalink,
    url: asString(raw.url) || null,
    createdUtc: asNumber(raw.createdUtc, Math.floor(Date.now() / 1000)),
    score: asNumber(raw.score, 0),
    numComments: asNumber(raw.numComments, 0),
    upvoteRatio: null,
    linkFlairText: null,
    over18: false,
    isSelf: false,
    domain: null,
    postHint: asString(raw.postHint) || null,
  };
}

function scorePostQuality(post: RedditPost): number {
  return (post.id.startsWith("t3_") ? 10_000 : 0) + post.score + post.numComments;
}

function dedupePosts(posts: RedditPost[]): RedditPost[] {
  const rows = new Map<string, RedditPost>();

  for (const post of posts) {
    const key = redditIdFromPermalink(post.permalink) || post.id || post.permalink;
    const existing = rows.get(key);

    if (!existing || scorePostQuality(post) > scorePostQuality(existing)) {
      rows.set(key, post);
    }
  }

  return [...rows.values()];
}

function toComment(raw: BrowserImportComment, index: number): RedditComment | null {
  const body = asString(raw.body);
  const subreddit = asString(raw.subreddit).replace(/^r\//i, "");
  const permalink = absoluteRedditUrl(raw.permalink);

  if (!body || !subreddit) return null;

  return {
    id: asString(raw.id, `browser-comment-${index}`),
    body,
    subreddit,
    permalink,
    createdUtc: asNumber(raw.createdUtc, Math.floor(Date.now() / 1000)),
    score: asNumber(raw.score, 0),
    linkTitle: asString(raw.linkTitle) || null,
  };
}

function parsePayload(raw: string): BrowserImportPayload {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      throw new BrowserImportError("Browser import must be a JSON object.");
    }
    return parsed as BrowserImportPayload;
  } catch (error) {
    if (error instanceof BrowserImportError) throw error;
    throw new BrowserImportError("Paste the JSON object produced by the browser capture snippet.");
  }
}

export function parseBrowserImport(raw: string): RedditAccountData {
  const payload = parsePayload(raw);
  const profile = toProfile(payload);
  const rawPostCount = Array.isArray(payload.posts) ? payload.posts.length : 0;
  const parsedPosts = Array.isArray(payload.posts)
    ? payload.posts.map((post, index) => toPost(post, index, profile.username)).filter((post): post is RedditPost => Boolean(post))
    : [];
  const posts = dedupePosts(parsedPosts);
  const comments = Array.isArray(payload.comments)
    ? payload.comments.map(toComment).filter((comment): comment is RedditComment => Boolean(comment))
    : [];
  const removedPostRows = rawPostCount - posts.length;

  if (posts.length === 0 && comments.length === 0) {
    throw new BrowserImportError("Browser import did not contain any usable posts or comments.");
  }

  return {
    profile,
    posts,
    comments,
    warnings: [
      "Imported from browser capture because Reddit blocked server-side public JSON.",
      removedPostRows > 0 ? `Cleaned ${removedPostRows} duplicate or incomplete browser post rows.` : null,
      posts.length === 0 ? "No posts were found in the browser import." : null,
      comments.length === 0 ? "No comments were found in the browser import." : null,
    ].filter((warning): warning is string => Boolean(warning)),
  };
}
