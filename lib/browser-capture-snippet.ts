export const BROWSER_CAPTURE_SNIPPET = `(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const text = (node) => node?.textContent?.trim() ?? "";
  const numberFrom = (value) => {
    const raw = String(value ?? "").trim().toLowerCase().replace(/,/g, "");
    const match = raw.match(/-?\\d+(?:\\.\\d+)?\\s*[kmb]?/);
    if (!match) return 0;
    const token = match[0].replace(/\\s/g, "");
    const multiplier = token.endsWith("k") ? 1000 : token.endsWith("m") ? 1000000 : token.endsWith("b") ? 1000000000 : 1;
    return Math.round(parseFloat(token) * multiplier);
  };
  const nullableNumberFrom = (value) => {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const parsed = numberFrom(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const viewCountFromNode = (node) => {
    const attrs = ["view-count", "views", "total-views", "post-view-count"];
    for (const attr of attrs) {
      const value = node.getAttribute?.(attr);
      if (value) return nullableNumberFrom(value);
    }
    const labels = [
      node.getAttribute?.("aria-label"),
      node.getAttribute?.("title"),
      ...Array.from(node.querySelectorAll?.("[aria-label], [title]") || []).map((child) => child.getAttribute("aria-label") || child.getAttribute("title") || ""),
      node.innerText || node.textContent || "",
    ];
    for (const label of labels) {
      const match = String(label || "").match(/(\\d[\\d,.]*\\s*[kmb]?)\\s+(?:total\\s+)?views?|(?:total\\s+)?views?\\s+(\\d[\\d,.]*\\s*[kmb]?)/i);
      const value = match ? nullableNumberFrom(match[1] || match[2]) : null;
      if (value !== null) return value;
    }
    return null;
  };
  const redditIdFromHref = (href) => href?.match(/\\/comments\\/([^/]+)\\//i)?.[1] ?? "";
  const subredditFromHref = (href) => href?.match(/\\/r\\/([^/]+)\\//i)?.[1] ?? "";
  const username = location.pathname.match(/\\/user\\/([^/]+)/i)?.[1] || location.pathname.match(/\\/u\\/([^/]+)/i)?.[1] || document.querySelector('[data-testid="profile-name"]')?.textContent?.replace(/^u\\//i, "") || "";
  const postsByKey = new Map();
  const makeProgressBox = () => {
    document.getElementById("paidpolitely-capture-progress")?.remove();
    const box = document.createElement("div");
    box.id = "paidpolitely-capture-progress";
    box.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483646;background:#120b16;color:#fff;border:1px solid #ff4f91;border-radius:14px;padding:12px 14px;font:13px system-ui;box-shadow:0 12px 40px rgba(0,0,0,.35);max-width:320px;";
    document.body.append(box);
    return (message) => { box.textContent = message; };
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
      if (node.querySelector('a[href*="/comments/"]')) add(node);
    });
    document.querySelectorAll('a[href*="/comments/"]').forEach((anchor) => {
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
      const idFromHref = redditIdFromHref(href);
      const id = node.getAttribute?.("id") || (idFromHref ? "t3_" + idFromHref : "browser-post-" + index);
      const title = text(node.querySelector?.('[slot="title"], a[slot="title"], h1, h2, h3')) || text(anchor);
      const subredditAttribute = node.getAttribute?.("subreddit-prefixed-name") || node.getAttribute?.("subreddit") || "";
      const subreddit = subredditFromHref(href) || subredditAttribute.replace(/^r\\//i, "");
      const score = numberFrom(node.getAttribute?.("score") || text(node.querySelector?.('[aria-label*="upvote"], [id*="score"], faceplate-number')));
      const numComments = numberFrom(node.getAttribute?.("comment-count") || text(node.querySelector?.('a[href*="/comments/"][aria-label], [aria-label*="comment"]')));
      const createdRaw = node.getAttribute?.("created-timestamp") || node.getAttribute?.("created") || node.querySelector?.("time")?.getAttribute("datetime") || "";
      const createdParsed = Date.parse(createdRaw);
      const createdUtc = Number.isFinite(createdParsed) ? Math.floor(createdParsed / 1000) : Math.floor(Date.now() / 1000);
      if (!title || !subreddit || !href) continue;
      const key = idFromHref || id || href;
      const viewCount = viewCountFromNode(node);
      const post = { id, title, subreddit, permalink: href, score, numComments, createdUtc, viewCount };
      const existing = postsByKey.get(key);
      if (!existing || (post.viewCount ?? -1) > (existing.viewCount ?? -1) || post.score + post.numComments > existing.score + existing.numComments) {
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
      get top() { return element === document.body || element === document.documentElement || element === document.scrollingElement ? window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0 : element.scrollTop; },
      set top(value) {
        if (element === document.body || element === document.documentElement || element === document.scrollingElement) window.scrollTo(0, value);
        else element.scrollTop = value;
      },
      get height() { return element.scrollHeight || document.body.scrollHeight; },
      get clientHeight() { return element === document.body || element === document.documentElement || element === document.scrollingElement ? window.innerHeight : element.clientHeight; },
      fireScroll() {
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
        window.dispatchEvent(new Event("scroll"));
      }
    };
  };
  const showManualCopyBox = (json) => {
    document.getElementById("paidpolitely-capture-output")?.remove();
    const wrapper = document.createElement("div");
    wrapper.id = "paidpolitely-capture-output";
    wrapper.style.cssText = "position:fixed;inset:24px;z-index:2147483647;background:#120b16;color:white;border:2px solid #ff4f91;border-radius:16px;padding:16px;box-shadow:0 24px 80px rgba(0,0,0,.45);font:14px system-ui;display:flex;flex-direction:column;gap:12px;";
    const heading = document.createElement("strong");
    heading.textContent = "PaidPolitely capture finished — copy the JSON below";
    const help = document.createElement("div");
    help.textContent = "Clipboard write was blocked, so select/copy from this box manually, then paste it into PaidPolitely.";
    help.style.color = "#c9adbd";
    const textarea = document.createElement("textarea");
    textarea.value = json;
    textarea.style.cssText = "width:100%;height:100%;min-height:360px;resize:none;border-radius:12px;padding:12px;background:#fff;color:#111;font:12px ui-monospace,SFMono-Regular,Consolas,monospace;";
    const close = document.createElement("button");
    close.textContent = "Close";
    close.style.cssText = "align-self:flex-end;border:0;border-radius:10px;padding:10px 14px;background:#ff4f91;color:#1c0b14;font-weight:800;cursor:pointer;";
    close.onclick = () => wrapper.remove();
    wrapper.append(heading, help, textarea, close);
    document.body.append(wrapper);
    textarea.focus();
    textarea.select();
  };
  const copyJson = async (json) => {
    try {
      await navigator.clipboard.writeText(json);
      console.log("PaidPolitely capture copied to clipboard");
      return true;
    } catch (error) {
      console.warn("PaidPolitely clipboard write blocked; showing manual copy box", error);
      showManualCopyBox(json);
      return false;
    }
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
  const payload = {
    source: "paidpolitely-reddit-browser-import-v4",
    capturedAt: new Date().toISOString(),
    username,
    profile: { username },
    posts: Array.from(postsByKey.values()),
    comments: []
  };
  const json = JSON.stringify(payload, null, 2);
  await copyJson(json);
  console.log("PaidPolitely capture finished", payload);
})();`;
