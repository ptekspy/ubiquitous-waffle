export const BROWSER_CAPTURE_SNIPPET = `(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const text = (node) => node?.textContent?.trim() ?? "";
  const numberFrom = (value) => {
    const raw = String(value ?? "").trim().toLowerCase().replace(/,/g, "");
    const match = raw.match(/-?\\d+(?:\\.\\d+)?\\s*[km]?/);
    if (!match) return 0;
    const token = match[0].replace(/\\s/g, "");
    const multiplier = token.endsWith("k") ? 1000 : token.endsWith("m") ? 1000000 : 1;
    return Math.round(parseFloat(token) * multiplier);
  };
  const redditIdFromHref = (href) => href?.match(/\\/comments\\/([^/]+)\\//i)?.[1] ?? "";
  const subredditFromHref = (href) => href?.match(/\\/r\\/([^/]+)\\//i)?.[1] ?? "";
  const username = location.pathname.match(/\\/user\\/([^/]+)/i)?.[1] || location.pathname.match(/\\/u\\/([^/]+)/i)?.[1] || document.querySelector('[data-testid="profile-name"]')?.textContent?.replace(/^u\\//i, "") || "";
  const postsByKey = new Map();
  const visiblePostNodes = () => {
    const shredditPosts = Array.from(document.querySelectorAll("shreddit-post"));
    if (shredditPosts.length) return shredditPosts;
    return Array.from(document.querySelectorAll('article, [data-testid="post-container"]'));
  };
  const captureVisiblePosts = () => {
    for (const [index, node] of visiblePostNodes().entries()) {
      const href = node.getAttribute?.("permalink") || node.querySelector('a[href*="/comments/"]')?.getAttribute("href") || "";
      const idFromHref = redditIdFromHref(href);
      const id = node.getAttribute?.("id") || (idFromHref ? "t3_" + idFromHref : "browser-post-" + index);
      const title = text(node.querySelector('[slot="title"], a[slot="title"], h1, h2, h3')) || text(node.querySelector('a[href*="/comments/"]'));
      const subredditAttribute = node.getAttribute?.("subreddit-prefixed-name") || node.getAttribute?.("subreddit") || "";
      const subreddit = subredditFromHref(href) || subredditAttribute.replace(/^r\\//i, "");
      const score = numberFrom(node.getAttribute?.("score") || text(node.querySelector('[aria-label*="upvote"], [id*="score"], faceplate-number')));
      const numComments = numberFrom(node.getAttribute?.("comment-count") || text(node.querySelector('a[href*="/comments/"][aria-label], [aria-label*="comment"]')));
      const createdRaw = node.getAttribute?.("created-timestamp") || node.getAttribute?.("created") || node.querySelector("time")?.getAttribute("datetime") || "";
      const createdParsed = Date.parse(createdRaw);
      const createdUtc = Number.isFinite(createdParsed) ? Math.floor(createdParsed / 1000) : Math.floor(Date.now() / 1000);
      if (!title || !subreddit || !href) continue;
      const key = idFromHref || id || href;
      const post = { id, title, subreddit, permalink: href, score, numComments, createdUtc };
      const existing = postsByKey.get(key);
      if (!existing || post.score + post.numComments > existing.score + existing.numComments) {
        postsByKey.set(key, post);
      }
    }
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
  const startingScrollY = window.scrollY;
  let lastHeight = 0;
  let lastCount = 0;
  let unchangedPasses = 0;
  window.scrollTo(0, 0);
  await sleep(600);
  captureVisiblePosts();
  for (let pass = 0; pass < 90 && unchangedPasses < 5; pass += 1) {
    window.scrollBy(0, Math.max(700, window.innerHeight * 0.85));
    await sleep(650);
    captureVisiblePosts();
    const height = document.scrollingElement?.scrollHeight || document.body.scrollHeight;
    const count = postsByKey.size;
    if (height === lastHeight && count === lastCount) unchangedPasses += 1;
    else unchangedPasses = 0;
    lastHeight = height;
    lastCount = count;
  }
  window.scrollTo(0, 0);
  await sleep(500);
  captureVisiblePosts();
  window.scrollTo(0, startingScrollY);
  const payload = {
    source: "paidpolitely-reddit-browser-import-v3",
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
