const REDDIT_PROFILE_URL = "https://www.reddit.com/user/{username}/submitted/";
const OVERLAY_TIMEOUT_MS = 10 * 60 * 1000;
const TAB_LOAD_TIMEOUT_MS = 45 * 1000;
const REDDIT_JSON_LIMIT = 100;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      console.error("PaidPolitely extension error", error);
      sendResponse({ ok: false, status: "extension_error", error: error?.message || "PaidPolitely extension failed." });
    });

  return true;
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      console.error("PaidPolitely extension error", error);
      sendResponse({ ok: false, status: "extension_error", error: error?.message || "PaidPolitely extension failed." });
    });

  return true;
});

async function handleMessage(message) {
  if (!message || typeof message !== "object") {
    return { ok: false, status: "bad_request", error: "Missing PaidPolitely message." };
  }

  if (message.type === "PAIDPOLITELY_PING") {
    return {
      ok: true,
      status: "installed",
      version: chrome.runtime.getManifest().version,
      name: chrome.runtime.getManifest().name,
      bridge: "runtime",
    };
  }

  if (message.type === "PAIDPOLITELY_SCAN_REDDIT_PROFILE") {
    const username = normaliseUsername(message.username);
    if (!username) {
      return { ok: false, status: "bad_username", error: "PaidPolitely needs a valid Reddit username." };
    }

    return scanRedditProfile(username, {
      preferHeadless: message.preferHeadless !== false,
      openInBackground: message.openInBackground !== false,
    });
  }

  return { ok: false, status: "unknown_message", error: `Unsupported PaidPolitely message: ${message.type}` };
}

function normaliseUsername(value) {
  const username = String(value || "").trim().replace(/^https?:\/\/(www\.)?reddit\.com\/user\//i, "").replace(/^https?:\/\/(www\.)?reddit\.com\/u\//i, "").replace(/^u\//i, "").replace(/^@/, "").split(/[/?#]/)[0];
  return /^[A-Za-z0-9_-]{3,20}$/.test(username) ? username : "";
}

async function scanRedditProfile(username, options = { preferHeadless: true, openInBackground: true }) {
  if (options.preferHeadless) {
    const headlessResult = await scanRedditProfileWithoutTab(username);
    if (headlessResult.ok) return headlessResult;
  }

  return scanRedditProfileFromTab(username, { openInBackground: options.openInBackground });
}

async function scanRedditProfileWithoutTab(username) {
  const aboutUrl = `https://www.reddit.com/user/${encodeURIComponent(username)}/about.json?raw_json=1`;
  const submittedUrl = `https://www.reddit.com/user/${encodeURIComponent(username)}/submitted.json?limit=${REDDIT_JSON_LIMIT}&raw_json=1`;
  const commentsUrl = `https://www.reddit.com/user/${encodeURIComponent(username)}/comments.json?limit=${REDDIT_JSON_LIMIT}&raw_json=1`;

  const [aboutResult, submittedResult, commentsResult] = await Promise.all([
    fetchRedditJson(aboutUrl),
    fetchRedditJson(submittedUrl),
    fetchRedditJson(commentsUrl),
  ]);

  if (!submittedResult.ok && !commentsResult.ok) {
    return {
      ok: false,
      status: "headless_blocked",
      error: "Reddit blocked extension JSON fetches, so PaidPolitely will use the quiet tab scanner instead.",
    };
  }

  const profile = aboutResult.ok ? toHeadlessProfile(aboutResult.data, username) : fallbackProfile(username);
  const posts = submittedResult.ok ? extractListingChildren(submittedResult.data).map(toHeadlessPost).filter(Boolean) : [];
  const comments = commentsResult.ok ? extractListingChildren(commentsResult.data).map(toHeadlessComment).filter(Boolean) : [];

  if (posts.length === 0 && comments.length === 0) {
    return {
      ok: false,
      status: "headless_empty",
      error: "Reddit JSON was reachable, but did not contain usable account rows. PaidPolitely will use the quiet tab scanner instead.",
    };
  }

  return {
    ok: true,
    status: "captured_headless",
    payload: {
      source: "paidpolitely-reddit-extension-headless-v1",
      capturedAt: new Date().toISOString(),
      username,
      profile,
      posts,
      comments,
    },
  };
}

async function fetchRedditJson(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        accept: "application/json,text/plain,*/*",
      },
    });

    if (!response.ok) {
      return { ok: false, status: response.status, error: `Reddit returned HTTP ${response.status}.` };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, status: "fetch_failed", error: error?.message || "Reddit JSON fetch failed." };
  }
}

function extractListingChildren(value) {
  const children = value?.data?.children;
  return Array.isArray(children) ? children : [];
}

function fallbackProfile(username) {
  return {
    id: username,
    username,
    createdUtc: null,
    totalKarma: 0,
    linkKarma: 0,
    commentKarma: 0,
    over18: false,
    iconUrl: null,
  };
}

function toHeadlessProfile(value, fallbackUsername) {
  const data = value?.data || {};
  const username = normaliseUsername(data.name || fallbackUsername) || fallbackUsername;
  const linkKarma = asNumber(data.link_karma, 0);
  const commentKarma = asNumber(data.comment_karma, 0);

  return {
    id: String(data.id || username),
    username,
    createdUtc: asNumber(data.created_utc, 0) || null,
    totalKarma: asNumber(data.total_karma, linkKarma + commentKarma),
    linkKarma,
    commentKarma,
    over18: Boolean(data.over_18),
    iconUrl: typeof data.icon_img === "string" && data.icon_img.length > 0 ? data.icon_img : null,
  };
}

function toHeadlessPost(child) {
  if (child?.kind !== "t3") return null;
  const data = child.data || {};
  const permalink = canonicalRedditUrl(data.permalink);
  const subreddit = String(data.subreddit || "").replace(/^r\//i, "");
  const title = String(data.title || "").trim();

  if (!title || !subreddit || !permalink) return null;
  if (isGameOrPromoRow({ title, subreddit, permalink, score: asNumber(data.score, 0), numComments: asNumber(data.num_comments, 0), id: String(data.name || data.id || "") })) return null;

  return {
    id: String(data.name || (data.id ? `t3_${data.id}` : permalink)),
    title,
    subreddit,
    permalink,
    url: typeof data.url === "string" && data.url.length > 0 ? data.url : null,
    createdUtc: asNumber(data.created_utc, Math.floor(Date.now() / 1000)),
    score: asNumber(data.score, 0),
    numComments: asNumber(data.num_comments, 0),
    postHint: typeof data.post_hint === "string" ? data.post_hint : null,
  };
}

function toHeadlessComment(child) {
  if (child?.kind !== "t1") return null;
  const data = child.data || {};
  const body = String(data.body || "").trim();
  const subreddit = String(data.subreddit || "").replace(/^r\//i, "");

  if (!body || !subreddit) return null;

  return {
    id: String(data.name || (data.id ? `t1_${data.id}` : canonicalRedditUrl(data.permalink))),
    body,
    subreddit,
    permalink: canonicalRedditUrl(data.permalink),
    createdUtc: asNumber(data.created_utc, Math.floor(Date.now() / 1000)),
    score: asNumber(data.score, 0),
    linkTitle: typeof data.link_title === "string" && data.link_title.length > 0 ? data.link_title : null,
  };
}

function canonicalRedditUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const absolute = raw.startsWith("https://") ? raw : raw.startsWith("/") ? `https://www.reddit.com${raw}` : `https://www.reddit.com/${raw}`;

  try {
    const url = new URL(absolute);
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return absolute.split(/[?#]/)[0].replace(/\/$/, "");
  }
}

function asNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function isGameOrPromoRow({ title, subreddit, permalink, score, numComments, id }) {
  const lowerPermalink = String(permalink || "").toLowerCase();
  const lowerSubreddit = String(subreddit || "").toLowerCase();
  const lowerTitle = String(title || "").trim().toLowerCase();

  if (lowerPermalink.includes("entry_point=games_drawer") || lowerPermalink.includes("/r/colorpuzzlegame/")) return true;
  if (lowerSubreddit === "colorpuzzlegame" && lowerTitle === "color puzzle") return true;
  if (String(id || "").startsWith("browser-post-") && score >= 100000 && numComments === 0) return true;

  return false;
}

async function scanRedditProfileFromTab(username, options = { openInBackground: true }) {
  const tab = await findOrOpenRedditProfileTab(username, { active: !options.openInBackground });
  await waitForTabLoad(tab.id);
  await delay(1000);

  let preflight = await runInTab(tab.id, preflightRedditProfileInPage, [username]);

  if (preflight.status === "needs_login" || preflight.status === "needs_age_confirm") {
    await focusTab(tab);
    const action = await withTimeout(
      runInTab(tab.id, showRedditSignpostOverlayInPage, [preflight.reason]),
      OVERLAY_TIMEOUT_MS,
      "Timed out waiting for the user to sign in to Reddit."
    );

    if (action?.action === "cancel") {
      return { ok: false, status: "cancelled", error: "Reddit scan cancelled before sign-in completed." };
    }

    await waitForTabLoad(tab.id).catch(() => undefined);
    await delay(1500);
    preflight = await runInTab(tab.id, preflightRedditProfileInPage, [username]);
  }

  if (preflight.status !== "ready") {
    await focusTab(tab);
    return {
      ok: false,
      status: preflight.status,
      error: preflight.reason || "Reddit profile is not ready to scan. I opened the Reddit tab so you can check what Reddit is showing.",
    };
  }

  const payload = await runInTab(tab.id, captureRedditProfileInPage, [username]);

  if (!payload || !Array.isArray(payload.posts) || payload.posts.length === 0) {
    await focusTab(tab);
    return { ok: false, status: "empty_capture", error: "Reddit loaded, but no usable post rows were captured. I opened the Reddit tab so you can check what Reddit is showing." };
  }

  return { ok: true, status: "captured", payload };
}

async function findOrOpenRedditProfileTab(username, options = { active: false }) {
  const tabs = await chrome.tabs.query({ url: ["https://www.reddit.com/*", "https://reddit.com/*"] });
  const lowerUsername = username.toLowerCase();
  const existingProfileTab = tabs.find((tab) => {
    try {
      const url = new URL(tab.url || "");
      const path = url.pathname.toLowerCase();
      return path.includes(`/user/${lowerUsername}`) || path.includes(`/u/${lowerUsername}`);
    } catch {
      return false;
    }
  });

  if (existingProfileTab?.id) {
    if (existingProfileTab.discarded) {
      await chrome.tabs.reload(existingProfileTab.id).catch(() => undefined);
    }
    return existingProfileTab;
  }

  const url = REDDIT_PROFILE_URL.replace("{username}", encodeURIComponent(username));
  return chrome.tabs.create({ url, active: options.active });
}

async function focusTab(tab) {
  if (!tab?.id) return;
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId !== undefined) {
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
  }
}

function waitForTabLoad(tabId) {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out waiting for Reddit tab to load."));
    }, TAB_LOAD_TIMEOUT_MS);

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    } catch (error) {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      reject(error);
    }
  });
}

async function runInTab(tabId, func, args = []) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
  });

  return result?.result;
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function preflightRedditProfileInPage(expectedUsername) {
  const bodyText = (document.body?.innerText || "").toLowerCase();
  const path = location.pathname.toLowerCase();
  const username = String(expectedUsername || "").toLowerCase();
  const profilePathMatches = path.includes(`/user/${username}`) || path.includes(`/u/${username}`);
  const hasPostLikeNodes = Boolean(
    document.querySelector("shreddit-post") ||
      document.querySelector('[data-testid="post-container"]') ||
      document.querySelector('article a[href*="/comments/"]') ||
      document.querySelector('a[href*="/comments/"]')
  );

  if (path.includes("/login") || bodyText.includes("log in to reddit") || bodyText.includes("sign up to reddit")) {
    return { status: "needs_login", reason: "Reddit is asking you to sign in before this profile can be scanned." };
  }

  if (bodyText.includes("unreviewed content") || bodyText.includes("mature content") || bodyText.includes("over 18") || bodyText.includes("view mature content")) {
    return { status: "needs_age_confirm", reason: "Reddit is showing an age or mature-content screen. Confirm it in this tab, then continue the scan." };
  }

  if (bodyText.includes("sorry, nobody on reddit goes by that name") || bodyText.includes("this account has been suspended") || bodyText.includes("page not found")) {
    return { status: "profile_unavailable", reason: "Reddit says this profile is unavailable." };
  }

  if (hasPostLikeNodes || profilePathMatches) {
    return { status: "ready", reason: "Reddit profile is ready to scan." };
  }

  return { status: "unknown_error", reason: "Reddit loaded, but the extension could not recognise the profile page." };
}

function showRedditSignpostOverlayInPage(reason) {
  return new Promise((resolve) => {
    document.getElementById("paidpolitely-signpost")?.remove();

    const wrapper = document.createElement("div");
    wrapper.id = "paidpolitely-signpost";
    wrapper.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483647;width:min(380px,calc(100vw - 36px));background:#120b16;color:#fff;border:2px solid #ff4f91;border-radius:18px;padding:16px;box-shadow:0 20px 70px rgba(0,0,0,.45);font:14px system-ui;";

    const title = document.createElement("strong");
    title.textContent = "PaidPolitely needs Reddit to be visible";
    title.style.cssText = "display:block;margin-bottom:8px;font-size:16px;";

    const body = document.createElement("p");
    body.textContent = `${reason} PaidPolitely does not read your Reddit password, cookies, session token, private messages, or account settings. Sign in or confirm the page in this tab, then click Continue scan.`;
    body.style.cssText = "margin:0 0 14px;color:#c9adbd;line-height:1.45;";

    const buttons = document.createElement("div");
    buttons.style.cssText = "display:flex;gap:10px;justify-content:flex-end;";

    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.style.cssText = "border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:10px 12px;background:transparent;color:#fff;font-weight:800;cursor:pointer;";

    const retry = document.createElement("button");
    retry.textContent = "Continue scan";
    retry.style.cssText = "border:0;border-radius:10px;padding:10px 12px;background:linear-gradient(135deg,#ff4f91,#ffb86b);color:#1c0b14;font-weight:900;cursor:pointer;";

    cancel.onclick = () => {
      wrapper.remove();
      resolve({ action: "cancel" });
    };

    retry.onclick = () => {
      wrapper.remove();
      resolve({ action: "retry" });
    };

    buttons.append(cancel, retry);
    wrapper.append(title, body, buttons);
    document.body.append(wrapper);
  });
}

async function captureRedditProfileInPage(expectedUsername) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const text = (node) => node?.textContent?.trim() ?? "";
  const numberFrom = (value) => {
    const raw = String(value ?? "").trim().toLowerCase().replace(/,/g, "");
    const match = raw.match(/-?\d+(?:\.\d+)?\s*[km]?/);
    if (!match) return 0;
    const token = match[0].replace(/\s/g, "");
    const multiplier = token.endsWith("k") ? 1000 : token.endsWith("m") ? 1000000 : 1;
    return Math.round(parseFloat(token) * multiplier);
  };
  const absolute = (href) => {
    if (!href) return "";
    if (href.startsWith("https://")) return href;
    if (href.startsWith("/")) return "https://www.reddit.com" + href;
    return "https://www.reddit.com/" + href;
  };
  const canonical = (href) => {
    try {
      const url = new URL(absolute(href));
      return url.origin + url.pathname.replace(/\/$/, "");
    } catch {
      return absolute(href).split(/[?#]/)[0].replace(/\/$/, "");
    }
  };
  const redditIdFromHref = (href) => href?.match(/\/comments\/([^/?#]+)(?:[/?#]|$)/i)?.[1] ?? "";
  const subredditFromHref = (href) => href?.match(/\/r\/([^/]+)\//i)?.[1] ?? "";
  const isCommentHref = (href) => /\/comments\/[^/]+\/[^/]+\/comment\//i.test(String(href || ""));
  const isGameOrPromoHref = (href) => {
    const lower = String(href || "").toLowerCase();
    return lower.includes("entry_point=games_drawer") || lower.includes("/r/colorpuzzlegame/");
  };
  const isGameOrPromoPost = ({ title, subreddit, href, score, numComments, id }) => isGameOrPromoRow({ title, subreddit, permalink: href, score, numComments, id });
  const username =
    String(expectedUsername || "") ||
    location.pathname.match(/\/user\/([^/]+)/i)?.[1] ||
    location.pathname.match(/\/u\/([^/]+)/i)?.[1] ||
    document.querySelector('[data-testid="profile-name"]')?.textContent?.replace(/^u\//i, "") ||
    "";
  const postsByKey = new Map();
  const makeProgressBox = () => {
    document.getElementById("paidpolitely-capture-progress")?.remove();
    const box = document.createElement("div");
    box.id = "paidpolitely-capture-progress";
    box.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483646;background:#120b16;color:#fff;border:1px solid #ff4f91;border-radius:14px;padding:12px 14px;font:13px system-ui;box-shadow:0 12px 40px rgba(0,0,0,.35);max-width:320px;";
    document.body.append(box);
    return (message) => {
      box.textContent = message;
    };
  };
  const setProgress = makeProgressBox();
  const visiblePostNodes = () => {
    const seen = new Set();
    const nodes = [];
    const add = (node) => {
      if (!node || seen.has(node)) return;
      seen.add(node);
      nodes.push(node);
    };
    document.querySelectorAll("shreddit-post").forEach(add);
    document.querySelectorAll('[data-testid="post-container"]').forEach(add);
    document.querySelectorAll("article").forEach((node) => {
      const anchor = node.querySelector('a[href*="/comments/"]');
      if (anchor && !isGameOrPromoHref(anchor.getAttribute("href"))) add(node);
    });
    document.querySelectorAll('a[href*="/comments/"]').forEach((anchor) => {
      const href = anchor.getAttribute("href") || "";
      if (isCommentHref(href) || isGameOrPromoHref(href)) return;
      add(anchor.closest("shreddit-post"));
      add(anchor.closest('[data-testid="post-container"]'));
      add(anchor.closest("article"));
      add(anchor);
    });
    return nodes;
  };
  const captureVisiblePosts = () => {
    for (const [index, node] of visiblePostNodes().entries()) {
      const anchor = node.matches?.('a[href*="/comments/"]') ? node : node.querySelector?.('a[href*="/comments/"]');
      const href = node.getAttribute?.("permalink") || anchor?.getAttribute("href") || "";
      if (isCommentHref(href) || isGameOrPromoHref(href)) continue;
      const idFromHref = redditIdFromHref(href);
      const id = node.getAttribute?.("id") || (idFromHref ? "t3_" + idFromHref : "browser-post-" + index);
      const title = text(node.querySelector?.('[slot="title"], a[slot="title"], h1, h2, h3')) || text(anchor);
      if (/^https?:\/\//i.test(title) && title.includes("/comments/")) continue;
      const subredditAttribute = node.getAttribute?.("subreddit-prefixed-name") || node.getAttribute?.("subreddit") || "";
      const subreddit = subredditFromHref(href) || subredditAttribute.replace(/^r\//i, "");
      const score = numberFrom(node.getAttribute?.("score") || text(node.querySelector?.('[aria-label*="upvote"], [id*="score"], faceplate-number')));
      const numComments = numberFrom(node.getAttribute?.("comment-count") || text(node.querySelector?.('a[href*="/comments/"][aria-label], [aria-label*="comment"]')));
      if (isGameOrPromoPost({ title, subreddit, href, score, numComments, id })) continue;
      const createdRaw = node.getAttribute?.("created-timestamp") || node.getAttribute?.("created") || node.querySelector?.("time")?.getAttribute("datetime") || "";
      const createdParsed = Date.parse(createdRaw);
      const createdUtc = Number.isFinite(createdParsed) ? Math.floor(createdParsed / 1000) : Math.floor(Date.now() / 1000);
      if (!title || !subreddit || !href) continue;
      const key = idFromHref || canonical(href) || id;
      const post = { id, title, subreddit, permalink: canonical(href), score, numComments, createdUtc };
      const existing = postsByKey.get(key);
      if (!existing || post.score + post.numComments > existing.score + existing.numComments) {
        postsByKey.set(key, post);
      }
    }
  };
  const findScrollTarget = () => {
    const candidates = [document.scrollingElement, document.documentElement, document.body, document.querySelector("main"), ...Array.from(document.querySelectorAll("main, shreddit-app, div, section"))]
      .filter(Boolean)
      .filter((element, index, array) => array.indexOf(element) === index)
      .filter((element) => element.scrollHeight > element.clientHeight + 300)
      .sort((a, b) => b.scrollHeight - a.scrollHeight);
    const element = candidates[0] || document.scrollingElement || document.documentElement || document.body;
    return {
      element,
      get top() {
        return element === document.body || element === document.documentElement || element === document.scrollingElement ? window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0 : element.scrollTop;
      },
      set top(value) {
        if (element === document.body || element === document.documentElement || element === document.scrollingElement) window.scrollTo(0, value);
        else element.scrollTop = value;
      },
      get height() {
        return element.scrollHeight || document.body.scrollHeight;
      },
      get clientHeight() {
        return element === document.body || element === document.documentElement || element === document.scrollingElement ? window.innerHeight : element.clientHeight;
      },
      fireScroll() {
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
        window.dispatchEvent(new Event("scroll"));
      },
    };
  };

  const scroller = findScrollTarget();
  const startingScrollY = scroller.top;
  let lastHeight = 0;
  let lastCount = 0;
  let unchangedNearBottomPasses = 0;
  scroller.top = 0;
  scroller.fireScroll();
  await sleep(1200);
  captureVisiblePosts();
  for (let pass = 0; pass < 180 && unchangedNearBottomPasses < 8; pass += 1) {
    const step = Math.max(550, Math.floor(scroller.clientHeight * 0.65));
    const beforeTop = scroller.top;
    const maxTop = Math.max(0, scroller.height - scroller.clientHeight);
    scroller.top = Math.min(maxTop, beforeTop + step);
    scroller.fireScroll();
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: step, bubbles: true, cancelable: true }));
    await sleep(1100);
    captureVisiblePosts();
    const currentTop = scroller.top;
    const currentHeight = scroller.height;
    const count = postsByKey.size;
    const nearBottom = currentTop + scroller.clientHeight >= currentHeight - 900;
    setProgress("PaidPolitely capturing Reddit posts: " + count + " found, pass " + (pass + 1) + ", " + (nearBottom ? "near bottom" : "scrolling"));
    if (nearBottom && currentHeight === lastHeight && count === lastCount) unchangedNearBottomPasses += 1;
    else unchangedNearBottomPasses = 0;
    if (currentTop === beforeTop && !nearBottom) unchangedNearBottomPasses += 1;
    lastHeight = currentHeight;
    lastCount = count;
  }
  scroller.top = 0;
  scroller.fireScroll();
  await sleep(900);
  captureVisiblePosts();
  scroller.top = startingScrollY;
  scroller.fireScroll();
  document.getElementById("paidpolitely-capture-progress")?.remove();

  return {
    source: "paidpolitely-reddit-extension-capture-v3",
    capturedAt: new Date().toISOString(),
    username,
    profile: { username },
    posts: Array.from(postsByKey.values()),
    comments: [],
  };
}
