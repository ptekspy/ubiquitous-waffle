importScripts("background.js");

const originalPaidPolitelyHandleMessage = handleMessage;

handleMessage = async function paidPolitelyHandleMessageWithPostCrawler(message, sender) {
  if (message?.type === "PAIDPOLITELY_DEEP_DIVE_REDDIT_POST") {
    const redditId = normaliseRedditPostId(message.redditId);
    if (!redditId) {
      return { ok: false, status: "bad_post_id", error: "PaidPolitely needs a valid Reddit post id." };
    }

    return deepDiveRedditPost(redditId);
  }

  return originalPaidPolitelyHandleMessage(message, sender);
};

function normaliseRedditPostId(value) {
  const id = String(value || "").trim().replace(/^t3_/, "").split(/[/?#]/)[0];
  return /^[A-Za-z0-9_]+$/.test(id) ? id : "";
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

  return {
    ok: true,
    status: "captured_post_deep_dive",
    payload: {
      source: "paidpolitely-reddit-extension-post-deep-dive-v1",
      capturedAt: new Date().toISOString(),
      post,
      comments,
      rawCommentCount: Array.isArray(result.data?.[1]?.data?.children) ? result.data[1].data.children.length : 0,
    },
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
