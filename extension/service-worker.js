importScripts("background.js");

const originalPaidPolitelyHandleMessage = handleMessage;

handleMessage = async function paidPolitelyHandleMessageWithCrawlers(message, sender) {
  if (message?.type === "PAIDPOLITELY_FETCH_SUBREDDIT_FLAIRS") {
    const subreddit = normaliseRedditName(message.subreddit);
    if (!subreddit) {
      return { ok: false, status: "bad_subreddit", error: "PaidPolitely needs a valid subreddit name." };
    }

    return fetchSubredditFlairs(subreddit);
  }

  if (message?.type === "PAIDPOLITELY_DEEP_DIVE_REDDIT_POST") {
    const redditId = normaliseRedditPostId(message.redditId);
    if (!redditId) {
      return { ok: false, status: "bad_post_id", error: "PaidPolitely needs a valid Reddit post id." };
    }

    return deepDiveRedditPost(redditId);
  }

  if (message?.type === "PAIDPOLITELY_CRAWL_REDDIT_TARGET") {
    return crawlRedditTarget(message.target);
  }

  return originalPaidPolitelyHandleMessage(message, sender);
};

async function fetchSubredditFlairs(subreddit) {
  const url = new URL(`https://www.reddit.com/r/${encodeURIComponent(subreddit)}/api/link_flair_v2.json`);
  url.searchParams.set("raw_json", "1");
  const result = await fetchRedditJson(url.toString());
  if (!result.ok) {
    return {
      ok: false,
      status: "flairs_unavailable",
      error: result.error || "Reddit did not return flair options for this subreddit.",
    };
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  const flairs = rows.map(toSubredditFlairOption).filter(Boolean);
  return {
    ok: true,
    status: "captured_subreddit_flairs",
    subreddit,
    flairs,
  };
}

function toSubredditFlairOption(row) {
  const id = String(row?.id || "").trim();
  if (!id) return null;
  const text = String(row.text || row.richtext?.map((item) => item?.t || "").join("") || "Untitled flair").trim();
  return {
    id,
    text,
    editable: Boolean(row.text_editable),
    textColor: typeof row.text_color === "string" ? row.text_color : null,
    backgroundColor: typeof row.background_color === "string" ? row.background_color : null,
  };
}

function normaliseRedditPostId(value) {
  const id = String(value || "").trim().replace(/^t3_/, "").split(/[/?#]/)[0];
  return /^[A-Za-z0-9_]+$/.test(id) ? id : "";
}

function normaliseRedditName(value) {
  const name = String(value || "").trim().replace(/^r\//i, "").replace(/^u\//i, "").replace(/^@/, "").split(/[/?#]/)[0];
  return /^[A-Za-z0-9_-]{2,32}$/.test(name) ? name : "";
}

async function deepDiveRedditPost(redditId) {
  const url = new URL(`https://www.reddit.com/comments/${encodeURIComponent(redditId)}.json`);
  url.searchParams.set("limit", "500");
  url.searchParams.set("raw_json", "1");
  url.searchParams.set("sort", "top");

  const result = await fetchRedditJson(url.toString());
  if (!result.ok) {
    return {
      ok: false,
      status: "reddit_blocked",
      error: result.error || "Reddit blocked the post deep dive.",
    };
  }

  const postChild = result.data?.[0]?.data?.children?.[0];
  if (!postChild?.data) {
    return { ok: false, status: "post_not_found", error: "Reddit did not return a usable post." };
  }

  const post = toDeepDivePost(postChild.data);
  const comments = flattenDeepDiveComments(result.data?.[1]?.data?.children || [], post.subreddit);
  const insights = await scrapeRedditPostInsights(post.permalink).catch((error) => ({
    viewCount: null,
    shareCount: null,
    source: "reddit-post-page-error",
    raw: { error: error?.message || "Post insight scrape failed." },
  }));

  return {
    ok: true,
    status: "captured_post_deep_dive",
    payload: {
      source: "paidpolitely-reddit-extension-post-deep-dive-v2",
      capturedAt: new Date().toISOString(),
      post,
      comments,
      insights,
      rawCommentCount: Array.isArray(result.data?.[1]?.data?.children) ? result.data[1].data.children.length : 0,
    },
  };
}

async function crawlRedditTarget(rawTarget) {
  const target = normaliseIdleTarget(rawTarget);
  if (!target) return { ok: false, status: "bad_idle_target", error: "PaidPolitely needs a valid idle crawler target." };

  if (target.kind === "USER_PROFILE") {
    const result = await scanRedditProfile(target.username, { preferHeadless: true, openInBackground: true });
    if (!result.ok) return result;

    return {
      ok: true,
      status: "captured_idle_user_profile",
      payload: {
        ...result.payload,
        source: "paidpolitely-reddit-extension-idle-user-profile-v1",
        target,
      },
    };
  }

  return crawlRedditListingTarget(target);
}

function normaliseIdleTarget(rawTarget) {
  if (!rawTarget || typeof rawTarget !== "object") return null;
  const kind = String(rawTarget.kind || "");
  const feed = String(rawTarget.feed || "best").trim().toLowerCase();
  const label = String(rawTarget.label || feed).slice(0, 160);

  if (kind === "SUBREDDIT_FEED") {
    const subreddit = normaliseRedditName(rawTarget.subreddit);
    if (!subreddit) return null;
    return { id: String(rawTarget.id || ""), kind, label, subreddit, username: null, feed };
  }

  if (kind === "USER_PROFILE") {
    const username = normaliseRedditName(rawTarget.username);
    if (!username) return null;
    return { id: String(rawTarget.id || ""), kind, label, subreddit: null, username, feed: "submitted+comments" };
  }

  if (kind === "HOME_FEED") {
    return { id: String(rawTarget.id || ""), kind, label, subreddit: null, username: null, feed };
  }

  return null;
}

function idleListingUrl(target) {
  const [feedName, timeRange] = String(target.feed || "best").split(":");
  const safeFeed = /^(new|best|hot|rising|top)$/.test(feedName) ? feedName : "best";
  const url = target.kind === "SUBREDDIT_FEED" ? new URL(`https://www.reddit.com/r/${encodeURIComponent(target.subreddit)}/${safeFeed}.json`) : new URL(`https://www.reddit.com/${safeFeed}.json`);

  if (safeFeed === "top") url.searchParams.set("t", /^(hour|day|week|month|year|all)$/.test(timeRange || "") ? timeRange : "day");
  return url.toString();
}

async function crawlRedditListingTarget(target) {
  const result = await fetchRedditListing(idleListingUrl(target), 3);
  if (!result.ok) {
    return {
      ok: false,
      status: "idle_listing_blocked",
      error: result.error || `Reddit blocked ${target.label} idle crawl.`,
    };
  }

  const posts = result.children.map(toIdleListingPost).filter(Boolean);

  return {
    ok: true,
    status: "captured_idle_listing",
    payload: {
      source: "paidpolitely-reddit-extension-idle-listing-v1",
      capturedAt: new Date().toISOString(),
      target,
      posts,
      comments: [],
      rawPostCount: result.children.length,
      metadata: {
        pages: result.pages,
        truncated: Boolean(result.after),
        feed: target.feed,
        kind: target.kind,
        label: target.label,
      },
    },
  };
}

function toIdleListingPost(child) {
  if (child?.kind !== "t3") return null;
  const data = child.data || {};
  const permalink = canonicalRedditUrl(data.permalink);
  const subreddit = String(data.subreddit || "").replace(/^r\//i, "");
  const title = String(data.title || "").trim();
  const author = normaliseRedditName(data.author) || null;

  if (!title || !subreddit || !permalink) return null;
  if (isGameOrPromoRow({ title, subreddit, permalink, score: asNumber(data.score, 0), numComments: asNumber(data.num_comments, 0), id: String(data.name || data.id || "") })) return null;

  return {
    id: String(data.name || (data.id ? `t3_${data.id}` : permalink)),
    title,
    subreddit,
    author,
    permalink,
    url: typeof data.url === "string" && data.url.length > 0 ? data.url : null,
    createdUtc: asNumber(data.created_utc, Math.floor(Date.now() / 1000)),
    score: asNumber(data.score, 0),
    numComments: asNumber(data.num_comments, 0),
    upvoteRatio: typeof data.upvote_ratio === "number" ? data.upvote_ratio : null,
    linkFlairText: typeof data.link_flair_text === "string" ? data.link_flair_text : null,
    over18: Boolean(data.over_18),
    isSelf: Boolean(data.is_self),
    domain: typeof data.domain === "string" ? data.domain : null,
    postHint: typeof data.post_hint === "string" ? data.post_hint : null,
  };
}

function toDeepDivePost(data) {
  const permalink = canonicalRedditUrl(data.permalink);
  return {
    id: String(data.name || (data.id ? `t3_${data.id}` : permalink)),
    title: String(data.title || "Untitled post"),
    subreddit: String(data.subreddit || "unknown").replace(/^r\//i, ""),
    permalink,
    url: typeof data.url === "string" && data.url.length > 0 ? data.url : null,
    createdUtc: asNumber(data.created_utc, 0),
    score: asNumber(data.score, 0),
    numComments: asNumber(data.num_comments, 0),
    upvoteRatio: typeof data.upvote_ratio === "number" ? data.upvote_ratio : null,
    linkFlairText: typeof data.link_flair_text === "string" ? data.link_flair_text : null,
    over18: Boolean(data.over_18),
    isSelf: Boolean(data.is_self),
    domain: typeof data.domain === "string" ? data.domain : null,
    postHint: typeof data.post_hint === "string" ? data.post_hint : null,
  };
}

async function scrapeRedditPostInsights(permalink) {
  const tab = await chrome.tabs.create({ url: permalink, active: false });

  try {
    await waitForTabLoad(tab.id);
    await delay(2600);
    const result = await runInTab(tab.id, scrapePostInsightsInPage, []);

    return {
      viewCount: typeof result?.viewCount === "number" ? result.viewCount : null,
      shareCount: typeof result?.shareCount === "number" ? result.shareCount : null,
      source: result?.source || "reddit-post-page",
      raw: {
        url: permalink,
        capturedAt: new Date().toISOString(),
        visible: Boolean(result?.visible),
        labels: Array.isArray(result?.labels) ? result.labels.slice(0, 80) : [],
        insightText: typeof result?.insightText === "string" ? result.insightText.slice(0, 6000) : "",
        jsonCandidates: Array.isArray(result?.jsonCandidates) ? result.jsonCandidates.slice(0, 40) : [],
        resourceUrls: Array.isArray(result?.resourceUrls) ? result.resourceUrls.slice(0, 40) : [],
        error: result?.error || null,
      },
    };
  } finally {
    if (tab?.id) await chrome.tabs.remove(tab.id).catch(() => undefined);
  }
}

async function scrapePostInsightsInPage() {
  const numberFrom = (value) => {
    const token = String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/,/g, "")
      .match(/-?\d+(?:\.\d+)?\s*[kmb]?/)?.[0]
      ?.replace(/\s/g, "");
    if (!token) return null;
    const multiplier = token.endsWith("k") ? 1000 : token.endsWith("m") ? 1000000 : token.endsWith("b") ? 1000000000 : 1;
    const parsed = parseFloat(token);
    return Number.isFinite(parsed) ? Math.round(parsed * multiplier) : null;
  };

  const compact = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const jsonCandidates = [];
  const resourceUrls = [];
  const output = { viewCount: null, shareCount: null };

  const metricKey = (key) => String(key || "").replace(/[_-]/g, "").toLowerCase();
  const blockedMetricPath = (path) => /screen|pageview|screenview|impression|viewport|video|media|ad|advert|comment/i.test(path);
  const metricValue = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
    return numberFrom(value);
  };
  const rememberCandidate = (kind, path, value, source) => {
    const parsed = metricValue(value);
    if (parsed === null || parsed < 0 || !Number.isFinite(parsed)) return;
    const joinedPath = path.join(".");
    if (blockedMetricPath(joinedPath)) return;
    const key = metricKey(path[path.length - 1]);
    const surrounding = metricKey(joinedPath);
    let metric = null;
    let confidence = 0;

    if (kind === "view") {
      if (/^(viewcount|views|totalviews|postviews|postviewcount|numviews|uniqueviews)$/.test(key)) confidence = 4;
      else if (/views/.test(key) && /insight|post|analytics|stats|metrics/.test(surrounding)) confidence = 3;
      metric = "viewCount";
    }

    if (kind === "share") {
      if (/^(sharecount|shares|totalshares|postshares)$/.test(key)) confidence = 4;
      else if (/shares/.test(key) && /insight|post|analytics|stats|metrics/.test(surrounding)) confidence = 3;
      metric = "shareCount";
    }

    if (!metric || confidence === 0) return;
    jsonCandidates.push({ metric, value: parsed, path: joinedPath.slice(0, 180), source });
    if (output[metric] === null || confidence >= 4) output[metric] = parsed;
  };
  const scanJsonForMetrics = (value, path = [], source = "json", depth = 0, seen = new Set()) => {
    if (!value || depth > 9) return;
    if (typeof value === "object") {
      if (seen.has(value)) return;
      seen.add(value);
    }

    if (Array.isArray(value)) {
      value.slice(0, 250).forEach((entry, index) => scanJsonForMetrics(entry, [...path, String(index)], source, depth + 1, seen));
      return;
    }

    if (typeof value !== "object") return;

    const object = value;
    for (const [key, entry] of Object.entries(object)) {
      const nextPath = [...path, key];
      const normalKey = metricKey(key);
      if (/view/.test(normalKey)) rememberCandidate("view", nextPath, entry, source);
      if (/share/.test(normalKey)) rememberCandidate("share", nextPath, entry, source);

      if ((normalKey === "label" || normalKey === "name" || normalKey === "title") && /views?/i.test(String(entry || ""))) {
        rememberCandidate("view", [...path, "value"], object.value ?? object.count ?? object.total ?? object.metric, source);
      }
      if ((normalKey === "label" || normalKey === "name" || normalKey === "title") && /shares?/i.test(String(entry || ""))) {
        rememberCandidate("share", [...path, "value"], object.value ?? object.count ?? object.total ?? object.metric, source);
      }

      if (entry && typeof entry === "object") scanJsonForMetrics(entry, nextPath, source, depth + 1, seen);
    }
  };
  const parseJsonish = (raw) => {
    const text = String(raw || "").trim();
    if (!text || text.length > 2000000) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };
  const jsonFromScripts = () => {
    const roots = [];
    for (const script of Array.from(document.querySelectorAll("script"))) {
      const raw = script.textContent || "";
      if (!/view|share|insight|stats|metric/i.test(raw)) continue;
      const parsed = parseJsonish(raw);
      if (parsed) roots.push({ source: `script:${script.id || script.type || "json"}`, value: parsed });
    }
    return roots.slice(0, 20);
  };
  const sameOriginResourceUrls = () => {
    const urls = new Set();
    for (const entry of performance.getEntriesByType?.("resource") || []) {
      const url = String(entry.name || "");
      if (!url || urls.has(url)) continue;
      if (!/^https:\/\/(www\.)?reddit\.com\//i.test(url)) continue;
      if (!/insight|metric|stats|post|shreddit|svc|gql|graphql|comments/i.test(url)) continue;
      urls.add(url);
    }
    return Array.from(urls).slice(0, 20);
  };
  const scanFetchedJsonResources = async () => {
    for (const url of sameOriginResourceUrls()) {
      resourceUrls.push(url);
      try {
        const response = await fetch(url, { credentials: "include", cache: "no-store" });
        const text = await response.text();
        const parsed = parseJsonish(text);
        if (parsed) scanJsonForMetrics(parsed, ["resource"], url);
        else if (/views?|shares?/i.test(text)) scanTextForMetrics(compact(text), "reddit-resource-text");
      } catch {
        // Resource replay is best-effort; visible text remains the fallback.
      }
      if (output.viewCount !== null && output.shareCount !== null) break;
    }
  };
  const scanTextForMetrics = (searchText, source) => {
    const patterns = [
      { key: "viewCount", regexes: [/(\d[\d,.]*\s*[kmb]?)\s+(?:total\s+)?views?/i, /(?:total\s+)?views?\s+(\d[\d,.]*\s*[kmb]?)/i, /post\s+views?\s+(\d[\d,.]*\s*[kmb]?)/i] },
      { key: "shareCount", regexes: [/(\d[\d,.]*\s*[kmb]?)\s+shares?/i, /shares?\s+(\d[\d,.]*\s*[kmb]?)/i] },
    ];

    for (const pattern of patterns) {
      if (output[pattern.key] !== null) continue;
      for (const regex of pattern.regexes) {
        const match = searchText.match(regex);
        const value = match ? numberFrom(match[1]) : null;
        if (value !== null) {
          output[pattern.key] = value;
          jsonCandidates.push({ metric: pattern.key, value, path: "text", source });
          break;
        }
      }
    }
  };

  for (const root of jsonFromScripts()) scanJsonForMetrics(root.value, ["script"], root.source);
  if (output.viewCount === null || output.shareCount === null) await scanFetchedJsonResources();

  const bodyText = compact(document.body?.innerText || "");
  const lower = bodyText.toLowerCase();

  const likelyInsightNodes = [...document.querySelectorAll("section, aside, shreddit-post, faceplate-tracker, div, span, p")]
    .map((node) => compact(node.innerText || node.getAttribute("aria-label") || node.getAttribute("title") || ""))
    .filter((text) => /views?|post insights?|insights?|upvote rate|shares?|total views?/i.test(text))
    .filter((text, index, arr) => text.length > 0 && text.length < 1400 && arr.indexOf(text) === index)
    .slice(0, 80);

  const insightText = compact(likelyInsightNodes.join("\n"));
  const searchText = insightText || bodyText;
  const labels = searchText.split(/\n| • | \| /).map(compact).filter(Boolean).slice(0, 100);

  scanTextForMetrics(searchText, "reddit-post-page-text");

  const allTextNodes = [...document.querySelectorAll("span, p, div, h1, h2, h3, h4")]
    .map((node) => compact(node.innerText || node.getAttribute("aria-label") || node.getAttribute("title") || ""))
    .filter(Boolean)
    .slice(0, 2000);

  for (let index = 0; index < allTextNodes.length; index += 1) {
    const text = allTextNodes[index];
    const previous = allTextNodes[index - 1] || "";
    const next = allTextNodes[index + 1] || "";
    if (output.viewCount === null && /^views?$/i.test(text)) output.viewCount = numberFrom(previous) ?? numberFrom(next);
    if (output.shareCount === null && /^shares?$/i.test(text)) output.shareCount = numberFrom(previous) ?? numberFrom(next);
  }

  return {
    ...output,
    visible: /views?|post insights?|insights?|upvote rate|shares?/i.test(lower),
    source: jsonCandidates.some((candidate) => candidate.source !== "reddit-post-page-text") ? "reddit-post-insights-json" : "reddit-post-page",
    labels,
    insightText,
    jsonCandidates,
    resourceUrls,
    error: output.viewCount === null && output.shareCount === null ? "No visible view/share insight values were found in post insights JSON or on the post page." : null,
  };
}

function flattenDeepDiveComments(children, fallbackSubreddit, depth = 0) {
  const comments = [];

  for (const child of children) {
    if (child?.kind !== "t1") continue;

    const data = child.data || {};
    const body = String(data.body || "").trim();
    const id = String(data.name || (data.id ? `t1_${data.id}` : ""));
    if (!id || !body) continue;

    comments.push({
      redditId: id,
      parentRedditId: typeof data.parent_id === "string" ? data.parent_id : null,
      author: typeof data.author === "string" ? data.author : null,
      body,
      subreddit: String(data.subreddit || fallbackSubreddit || "unknown").replace(/^r\//i, ""),
      permalink: data.permalink ? canonicalRedditUrl(data.permalink) : null,
      createdUtc: asNumber(data.created_utc, 0),
      score: asNumber(data.score, 0),
      depth: asNumber(data.depth, depth),
      isSubmitter: Boolean(data.is_submitter),
      distinguished: typeof data.distinguished === "string" ? data.distinguished : null,
    });

    if (typeof data.replies === "object" && Array.isArray(data.replies?.data?.children)) {
      comments.push(...flattenDeepDiveComments(data.replies.data.children, fallbackSubreddit, depth + 1));
    }
  }

  return comments;
}
