import type { RedditPost } from "@/lib/types";

export function getPostType(post: RedditPost): string {
  const hint = post.postHint?.toLowerCase();
  const url = post.url?.toLowerCase() ?? "";
  const domain = post.domain?.toLowerCase() ?? "";

  if (post.isSelf) return "text";
  if (hint?.includes("video") || domain.includes("v.redd.it") || url.includes("redgifs.com")) return "video";
  if (hint?.includes("image") || /\.(jpg|jpeg|png|gif|webp)(\?|$)/.test(url)) return "image";
  if (domain.includes("reddit.com") && url.includes("/gallery/")) return "gallery";

  return "link";
}

export function getMediaKey(post: RedditPost): string | null {
  const url = post.url?.trim();
  if (!url) return null;

  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.split(/[?#]/)[0]?.replace(/\/$/, "") || null;
  }
}
