import type { JsonObject, RedditAccountData, RedditComment, RedditPost, RedditProfile } from "./types";

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
  viewCount?: unknown;
  views?: unknown;
  latestViews?: unknown;
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
  awardeeKarma?: unknown;
  awarderKarma?: unknown;
  followerCount?: unknown;
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
  metadata?: unknown;
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
    const multiplier = normalised.endsWith("k") ? 1_000 : normalised.endsWith("m") ? 1_000_000 : normalised.endsWith("b") ? 1_000_000_000 : 1;
    const parsed = Number.parseFloat(normalised.replace(/[kmb]$/, ""));
    if (Number.isFinite(parsed)) return Math.round(parsed * multiplier);
  }
  return fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = asNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asJsonObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function absoluteRedditUrl(value: unknown): string {
  const raw = asString(value, "https://www.reddit.com");
  if (raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return `https://www.reddit.com${raw}`;
  return `https://www.reddit.com/${raw}`;
}

function canonicalRedditUrl(value: unknown): string {
  const absolute = absoluteRedditUrl(value);

  try {
    const url = new URL(absolute);
    const pathname = url.pathname.replace(/\/$/, "");
    return `${url.origin}${pathname}`;
  } catch {
    return absolute.split(/[?#]/)[0].replace(/\/$/, "");
  }
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
  const id = permalink.match(/\/comments\/([^/?#]+)(?:[/?#]|$)/i)?.[1];
  return id ? `t3_${id}` : "";
}

function isCommentPermalink(value: unknown): boolean {
  return /\/comments\/[^/]+\/[^/]+\/comment\//i.test(asString(value));
}

function isUrlOnlyTitle(title: string, permalink: string): boolean {
  if (!/^https?:\/\//i.test(title)) return false;
  return title === permalink || title.includes("/comments/");
}

function isRedditGameOrPromoRow(raw: BrowserImportPost): boolean {
  const title = asString(raw.title).toLowerCase();
  const subreddit = asString(raw.subreddit).replace(/^r\//i, "").toLowerCase();
  const permalink = absoluteRedditUrl(raw.permalink).toLowerCase();
  const score = asNumber(raw.score, 0);
  const numComments = asNumber(raw.numComments, 0);
  const id = asString(raw.id).toLowerCase();

  if (permalink.includes("entry_point=games_drawer") || permalink.includes("/r/colorpuzzlegame/")) return true;
  if (subreddit === "colorpuzzlegame" && title === "color puzzle") return true;
  if (id.startsWith("browser-post-") && score >= 100_000 && numComments === 0) return true;

  return false;
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
    awardeeKarma: asNumber(profile.awardeeKarma, 0),
    awarderKarma: asNumber(profile.awarderKarma, 0),
    followerCount: asNullableNumber(profile.followerCount),
    over18: asBoolean(profile.over18, false),
    iconUrl: asString(profile.iconUrl) || null,
  };
}

function toPost(raw: BrowserImportPost, index: number, username: string): RedditPost | null {
  if (isRedditGameOrPromoRow(raw)) return null;

  const title = asString(raw.title);
  const subreddit = cleanSubreddit(raw.subreddit, title, raw.permalink, username);
  const permalink = canonicalRedditUrl(raw.permalink);
  const rawId = asString(raw.id);

  if (!title || !subreddit || permalink === "https://www.reddit.com") return null;
  if (isCommentPermalink(permalink) || isUrlOnlyTitle(title, permalink)) return null;

  return {
    id: rawId || redditIdFromPermalink(raw.permalink) || `browser-post-${index}`,
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
    viewCount: asNullableNumber(raw.viewCount ?? raw.views ?? raw.latestViews),
  };
}

function scorePostQuality(post: RedditPost): number {
  return (post.id.startsWith("t3_") ? 10_000 : 0) + post.score + post.numComments;
}

function dedupePosts(posts: RedditPost[]): RedditPost[] {
  const rows = new Map<string, RedditPost>();

  for (const post of posts) {
    const key = redditIdFromPermalink(post.permalink) || canonicalRedditUrl(post.permalink) || post.id;
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
  const permalink = canonicalRedditUrl(raw.permalink);

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
  const rawPosts = Array.isArray(payload.posts) ? payload.posts : [];
  const rawComments = Array.isArray(payload.comments) ? payload.comments : [];
  const rawPostCount = rawPosts.length;
  const rawCommentCount = rawComments.length;
  const commentPermalinkRows = rawPosts.filter((post) => isCommentPermalink(post.permalink)).length;
  const gameOrPromoRows = rawPosts.filter(isRedditGameOrPromoRow).length;
  const parsedPosts = rawPosts
    .map((post, index) => toPost(post, index, profile.username))
    .filter((post): post is RedditPost => Boolean(post));
  const posts = dedupePosts(parsedPosts);
  const comments = rawComments.map(toComment).filter((comment): comment is RedditComment => Boolean(comment));
  const removedPostRows = rawPostCount - posts.length;

  if (posts.length === 0 && comments.length === 0) {
    throw new BrowserImportError("Browser import did not contain any usable posts or comments.");
  }

  return {
    profile,
    posts,
    comments,
    source: asString(payload.source, "browser-import"),
    capturedAt: asString(payload.capturedAt) || null,
    metadata: asJsonObject(payload.metadata),
    rawPostCount,
    rawCommentCount,
    warnings: [
      "Imported from browser capture because Reddit blocked server-side public JSON.",
      removedPostRows > 0 ? `Cleaned ${removedPostRows} duplicate, game/promo, comment-link, or incomplete browser post rows.` : null,
      gameOrPromoRows > 0 ? `Ignored ${gameOrPromoRows} Reddit game/promo rows so they do not count as posts.` : null,
      commentPermalinkRows > 0 ? `Ignored ${commentPermalinkRows} comment permalink rows so they do not count as posts.` : null,
      posts.length === 0 ? "No posts were found in the browser import." : null,
      comments.length === 0 ? "No comments were found in the browser import." : null,
    ].filter((warning): warning is string => Boolean(warning)),
  };
}
