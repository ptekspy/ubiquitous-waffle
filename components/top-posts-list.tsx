import type { RedditPost } from "@/lib/types";
import { compactNumber } from "@/utils/compact-number";
import { formatDate } from "@/utils/format-date";

export type TopPostsListProps = {
  posts: RedditPost[];
};

export function TopPostsList({ posts }: TopPostsListProps) {
  if (posts.length === 0) {
    return <p className="text-[#c9adbd]">No top posts captured yet.</p>;
  }

  return (
    <div className="grid gap-3">
      {posts.slice(0, 8).map((post, index) => (
        <a
          className="grid gap-2 rounded-3xl border border-white/12 bg-white/[0.045] p-4 text-[#fff8fb] no-underline transition hover:border-[#ff4f91]/50 hover:bg-white/[0.075]"
          href={post.permalink}
          key={post.id}
          rel="noreferrer"
          target="_blank"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-extrabold tracking-widest text-[#ffb86b] uppercase">#{index + 1} · r/{post.subreddit}</span>
              <strong className="mt-1 block leading-snug">{post.title}</strong>
            </div>
            <span className="shrink-0 rounded-2xl bg-[#ff4f91]/15 px-3 py-2 text-right text-sm font-black text-[#ffd7e6]">
              {compactNumber(post.score)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-bold text-[#c9adbd]">
            <span>{post.numComments} comments</span>
            <span>·</span>
            <span>{formatDate(post.createdUtc)}</span>
            <span>·</span>
            <span>{post.postHint ?? post.domain ?? "post"}</span>
          </div>
        </a>
      ))}
    </div>
  );
}
