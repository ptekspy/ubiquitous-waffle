export type ParsedHistoricalPost = {
  redditId: string;
  title: string;
  subreddit: string;
  permalink: string;
  createdUtc: number;
  score: number;
  numComments: number;
  upvoteRatio: number | null;
  viewCount: number | null;
  raw?: Record<string, unknown>;
};

export type ParsedHistoricalComment = {
  redditId: string;
  body: string;
  subreddit: string;
  permalink: string;
  createdUtc: number;
  score: number;
  linkTitle: string | null;
  viewCount: number | null;
  raw?: Record<string, unknown>;
};

export type ParsedProfileMetrics = {
  username: string | null;
  totalKarma: number | null;
  linkKarma: number | null;
  commentKarma: number | null;
  awardeeKarma: number | null;
  awarderKarma: number | null;
  followerCount: number | null;
  raw?: Record<string, unknown>;
};

export type ParsedHistoricalSnapshot = {
  source: string;
  username: string | null;
  profileMetrics: ParsedProfileMetrics;
  posts: ParsedHistoricalPost[];
  comments: ParsedHistoricalComment[];
  metadata: Record<string, unknown>;
};

type RawJsonPost = {
  id?: unknown;
  title?: unknown;
  subreddit?: unknown;
  permalink?: unknown;
  createdUtc?: unknown;
  score?: unknown;
  numComments?: unknown;
  upvoteRatio?: unknown;
  viewCount?: unknown;
  views?: unknown;
  latestViews?: unknown;
};

type RawJsonComment = {
  id?: unknown;
  body?: unknown;
  subreddit?: unknown;
  permalink?: unknown;
  createdUtc?: unknown;
  score?: unknown;
  linkTitle?: unknown;
  viewCount?: unknown;
  views?: unknown;
  latestViews?: unknown;
};

function htmlDecode(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function stripTags(value: string): string {
  return htmlDecode(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([A-Za-z0-9:_-]+)(?:=("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(raw))) {
    const key = match[1];
    const rawValue = match[2];
    if (!rawValue) {
      attrs[key] = "";
      continue;
    }

    const unquoted = rawValue.startsWith('"') || rawValue.startsWith("'") ? rawValue.slice(1, -1) : rawValue;
    attrs[key] = htmlDecode(unquoted);
  }

  return attrs;
}

function compactNumberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return fallback;

  const clean = value.trim().replace(/,/g, "");
  const match = clean.match(/^(-?\d+(?:\.\d+)?)([kKmMbB])?$/);
  if (!match) {
    const parsed = Number.parseInt(clean, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base)) return fallback;
  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
  return Math.round(base * multiplier);
}

function intValue(value: unknown, fallback = 0): number {
  return compactNumberValue(value, fallback);
}

function nullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = compactNumberValue(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function floatValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown): string | null {
  const text = stringValue(value);
  return text.length > 0 ? text : null;
}

function canonicalPermalink(value: string): string {
  if (!value) return "";
  if (value.startsWith("http")) return value;
  return `https://www.reddit.com${value.startsWith("/") ? value : `/${value}`}`;
}

function createdUtcFromTimestamp(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function subredditFromPermalink(permalink: string): string {
  const match = permalink.match(/\/r\/([^/]+)/i);
  if (match) return match[1];
  const userMatch = permalink.match(/\/user\/([^/]+)/i);
  return userMatch ? `u_${userMatch[1]}` : "unknown";
}

function titleUsername(raw: string): string | null {
  return raw.match(/<title>\s*([^<(]+)\s*\(u\/([^)]+)\)/i)?.[2] ?? null;
}

function titleFromNearbyHtml(raw: string, redditId: string): string | null {
  const titlePattern = new RegExp(`<a[^>]+id=["']post-title-${redditId}["'][^>]*>([\\s\\S]*?)<\\/a>`, "i");
  const match = raw.match(titlePattern);
  return match ? stripTags(match[1]) : null;
}

function segmentAround(raw: string, pattern: RegExp, before = 900, after = 3000): string | null {
  const match = raw.match(pattern);
  if (!match || match.index === undefined) return null;
  return raw.slice(Math.max(0, match.index - before), Math.min(raw.length, match.index + after));
}

function elementSegment(raw: string, start: number, closingTag: string): string {
  const closeIndex = raw.indexOf(closingTag, start);
  if (closeIndex === -1) return raw.slice(start, Math.min(raw.length, start + 16000));
  return raw.slice(start, closeIndex + closingTag.length);
}

function numberBeforeLabel(text: string, label: string): number | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`([0-9][0-9,.]*(?:\\.[0-9]+)?\\s*[kKmMbB]?)\\s+${escapedLabel}\\b`, "i");
  const match = text.match(pattern);
  return match ? nullableInt(match[1].replace(/\s+/g, "")) : null;
}

function numberAfterLabel(text: string, label: string): number | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escapedLabel}\\b\\s*[:\\-]?\\s*([0-9][0-9,.]*(?:\\.[0-9]+)?\\s*[kKmMbB]?)`, "i");
  const match = text.match(pattern);
  return match ? nullableInt(match[1].replace(/\s+/g, "")) : null;
}

function metricFromText(text: string, label: string): number | null {
  return numberBeforeLabel(text, label) ?? numberAfterLabel(text, label);
}

function viewCountFromText(text: string): number | null {
  return metricFromText(text, "views") ?? metricFromText(text, "view") ?? metricFromText(text, "total views") ?? metricFromText(text, "post views");
}

function parseFollowers(raw: string): number | null {
  const widget = segmentAround(raw, /profile-followers-widget|followers-widget|Followers/i, 400, 1800);
  if (!widget) return null;
  const text = stripTags(widget);
  return metricFromText(text, "followers") ?? metricFromText(text, "follower");
}

function parseKarmaMetrics(raw: string): Pick<ParsedProfileMetrics, "totalKarma" | "linkKarma" | "commentKarma" | "awardeeKarma" | "awarderKarma"> {
  const scoped = segmentAround(raw, /profile-karma-widget|karma-widget|Post Karma|Comment Karma|Total Karma|Karma/i, 800, 5000);
  const text = stripTags(scoped ?? raw);
  const linkKarma = metricFromText(text, "Post Karma") ?? metricFromText(text, "Link Karma");
  const commentKarma = metricFromText(text, "Comment Karma");
  const awardeeKarma = metricFromText(text, "Awardee Karma");
  const awarderKarma = metricFromText(text, "Awarder Karma");
  const explicitTotal = metricFromText(text, "Total Karma");

  const genericKarmaMatches = [...text.matchAll(/([0-9][0-9,.]*(?:\.[0-9]+)?\s*[kKmMbB]?)\s+Karma\b/gi)]
    .map((match) => nullableInt(match[1].replace(/\s+/g, "")))
    .filter((value): value is number => value !== null);
  const totalKarma = explicitTotal ?? genericKarmaMatches.find((value) => value !== linkKarma && value !== commentKarma) ?? (linkKarma !== null || commentKarma !== null ? (linkKarma ?? 0) + (commentKarma ?? 0) + (awardeeKarma ?? 0) + (awarderKarma ?? 0) : null);

  return {
    totalKarma,
    linkKarma,
    commentKarma,
    awardeeKarma,
    awarderKarma,
  };
}

function parseHtmlProfileMetrics(raw: string): ParsedProfileMetrics {
  const username = titleUsername(raw);
  const karma = parseKarmaMetrics(raw);
  const followerCount = parseFollowers(raw);

  return {
    username,
    ...karma,
    followerCount,
    raw: {
      parser: "reddit-html-profile",
      hasFollowerWidget: /profile-followers-widget|followers-widget/i.test(raw),
      hasKarmaText: /Post Karma|Comment Karma|Total Karma|Karma/i.test(raw),
    },
  };
}

function parseJsonProfileMetrics(payload: Record<string, unknown>): ParsedProfileMetrics {
  const profile = payload.profile && typeof payload.profile === "object" ? payload.profile as Record<string, unknown> : {};
  const username = stringValue(payload.username) || stringValue(profile.username);
  const linkKarma = nullableInt(profile.linkKarma ?? profile.postKarma);
  const commentKarma = nullableInt(profile.commentKarma);
  const awardeeKarma = nullableInt(profile.awardeeKarma);
  const awarderKarma = nullableInt(profile.awarderKarma);
  const totalKarma = nullableInt(profile.totalKarma) ?? (linkKarma !== null || commentKarma !== null ? (linkKarma ?? 0) + (commentKarma ?? 0) + (awardeeKarma ?? 0) + (awarderKarma ?? 0) : null);

  return {
    username: username || null,
    totalKarma,
    linkKarma,
    commentKarma,
    awardeeKarma,
    awarderKarma,
    followerCount: nullableInt(profile.followerCount ?? profile.followers),
    raw: { parser: "paidpolitely-json-profile" },
  };
}

function parseHtmlPosts(raw: string): ParsedHistoricalPost[] {
  const posts = new Map<string, ParsedHistoricalPost>();
  const pattern = /<shreddit-post(?=[\s>])([^>]*)>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(raw))) {
    const attrs = parseAttributes(match[1]);
    const redditId = stringValue(attrs.id);
    if (!redditId.startsWith("t3_")) continue;

    const permalink = canonicalPermalink(stringValue(attrs.permalink));
    const title = stringValue(attrs["post-title"]) || titleFromNearbyHtml(raw.slice(match.index, match.index + 5000), redditId) || "Untitled Reddit post";
    const subreddit = stringValue(attrs["subreddit-name"]) || stringValue(attrs["subreddit-prefixed-name"]).replace(/^r\//i, "") || subredditFromPermalink(permalink);
    const createdUtc = createdUtcFromTimestamp(stringValue(attrs["created-timestamp"]));
    const postHtml = elementSegment(raw, match.index, "</shreddit-post>");
    const postText = stripTags(postHtml);
    const viewCount = nullableInt(attrs["view-count"] ?? attrs.views ?? attrs["total-views"]) ?? viewCountFromText(postText);

    if (!permalink || createdUtc <= 0) continue;

    posts.set(redditId, {
      redditId,
      title,
      subreddit,
      permalink,
      createdUtc,
      score: intValue(attrs.score),
      numComments: intValue(attrs["comment-count"]),
      upvoteRatio: floatValue(attrs["upvote-ratio"]),
      viewCount,
      raw: {
        postType: attrs["post-type"] || null,
        contentHref: attrs["content-href"] || null,
        domain: attrs.domain || null,
        moderationVerdict: attrs["moderation-verdict"] || null,
      },
    });
  }

  return [...posts.values()];
}

function parseHtmlComments(raw: string): ParsedHistoricalComment[] {
  const comments = new Map<string, ParsedHistoricalComment>();
  const pattern = /<shreddit-comment-action-row\b([^>]*)>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(raw))) {
    const attrs = parseAttributes(match[1]);
    const redditId = stringValue(attrs["comment-id"]);
    if (!redditId.startsWith("t1_")) continue;

    const permalink = canonicalPermalink(stringValue(attrs.permalink));
    const before = raw.slice(Math.max(0, match.index - 7000), match.index);
    const timeMatches = [...before.matchAll(/<faceplate-timeago\b[^>]*\bts="([^"]+)"/gi)];
    const createdUtc = timeMatches.length > 0 ? createdUtcFromTimestamp(timeMatches.at(-1)?.[1] ?? "") : 0;
    const bodyMatches = [...before.matchAll(/<div[^>]+id="-post-rtjson-content"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi)];
    const body = bodyMatches.length > 0 ? stripTags(bodyMatches.at(-1)?.[1] ?? "") : "Comment body unavailable in HTML snapshot";
    const viewCount = viewCountFromText(stripTags(raw.slice(match.index, match.index + 1800)));
    const subreddit = subredditFromPermalink(permalink);

    if (!permalink || createdUtc <= 0) continue;

    comments.set(redditId, {
      redditId,
      body,
      subreddit,
      permalink,
      createdUtc,
      score: intValue(attrs.score),
      linkTitle: null,
      viewCount,
      raw: {
        telemetrySource: attrs["telemetry-source"] || null,
        voteState: attrs["vote-state"] || null,
      },
    });
  }

  return [...comments.values()];
}

function findJsonPayload(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try { return JSON.parse(trimmed); } catch { return null; }
  }

  const textarea = raw.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/i);
  if (textarea) {
    const decoded = htmlDecode(textarea[1]);
    try { return JSON.parse(decoded); } catch { /* fall through */ }
  }

  const sourceIndex = raw.indexOf('"source"');
  if (sourceIndex === -1) return null;
  const start = raw.lastIndexOf("{", sourceIndex);
  const end = raw.indexOf("}</textarea>", sourceIndex);
  if (start === -1 || end === -1) return null;

  try { return JSON.parse(htmlDecode(raw.slice(start, end + 1))); } catch { return null; }
}

function parseJsonPayload(value: unknown): ParsedHistoricalSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  const postsInput = Array.isArray(payload.posts) ? payload.posts : [];
  const commentsInput = Array.isArray(payload.comments) ? payload.comments : [];
  const profileMetrics = parseJsonProfileMetrics(payload);

  const posts = postsInput.map((post): ParsedHistoricalPost | null => {
    const row = post as RawJsonPost;
    const redditId = stringValue(row.id);
    const title = stringValue(row.title);
    const permalink = canonicalPermalink(stringValue(row.permalink));
    const subreddit = stringValue(row.subreddit) || subredditFromPermalink(permalink);
    const createdUtc = intValue(row.createdUtc);
    if (!redditId.startsWith("t3_") || !title || !permalink || createdUtc <= 0) return null;

    return {
      redditId,
      title,
      subreddit,
      permalink,
      createdUtc,
      score: intValue(row.score),
      numComments: intValue(row.numComments),
      upvoteRatio: floatValue(row.upvoteRatio),
      viewCount: nullableInt(row.viewCount ?? row.views ?? row.latestViews),
      raw: {},
    };
  }).filter((post): post is ParsedHistoricalPost => Boolean(post));

  const comments = commentsInput.map((comment): ParsedHistoricalComment | null => {
    const row = comment as RawJsonComment;
    const redditId = stringValue(row.id);
    const body = stringValue(row.body) || "Comment body unavailable in JSON snapshot";
    const permalink = canonicalPermalink(stringValue(row.permalink));
    const subreddit = stringValue(row.subreddit) || subredditFromPermalink(permalink);
    const createdUtc = intValue(row.createdUtc);
    if (!redditId.startsWith("t1_") || !permalink || createdUtc <= 0) return null;

    return {
      redditId,
      body,
      subreddit,
      permalink,
      createdUtc,
      score: intValue(row.score),
      linkTitle: nullableString(row.linkTitle),
      viewCount: nullableInt(row.viewCount ?? row.views ?? row.latestViews),
      raw: {},
    };
  }).filter((comment): comment is ParsedHistoricalComment => Boolean(comment));

  return {
    source: stringValue(payload.source) || "paidpolitely-json-snapshot",
    username: profileMetrics.username,
    profileMetrics,
    posts,
    comments,
    metadata: {
      parser: "json",
      capturedAt: payload.capturedAt ?? null,
      rawPostCount: postsInput.length,
      rawCommentCount: commentsInput.length,
      profileMetrics,
    },
  };
}

export function parseHistoricalSnapshotContent(raw: string): ParsedHistoricalSnapshot {
  const json = parseJsonPayload(findJsonPayload(raw));
  if (json && (json.posts.length > 0 || json.comments.length > 0)) return json;

  const posts = parseHtmlPosts(raw);
  const comments = parseHtmlComments(raw);
  const profileMetrics = parseHtmlProfileMetrics(raw);

  return {
    source: "reddit-profile-html",
    username: profileMetrics.username,
    profileMetrics,
    posts,
    comments,
    metadata: {
      parser: "reddit-html",
      rawLength: raw.length,
      postElementCount: posts.length,
      commentElementCount: comments.length,
      profileMetrics,
    },
  };
}
