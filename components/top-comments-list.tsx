import type { RedditComment } from "@/lib/types";
import { formatDate } from "@/utils/format-date";

export type TopCommentsListProps = {
  comments: RedditComment[];
};

export function TopCommentsList({ comments }: TopCommentsListProps) {
  if (comments.length === 0) {
    return <p className="text-[#c9adbd]">No comments captured yet.</p>;
  }

  return (
    <div className="grid gap-3">
      {comments.slice(0, 6).map((comment) => (
        <a
          className="grid gap-2 rounded-3xl border border-white/12 bg-white/[0.045] p-4 text-[#fff8fb] no-underline transition hover:border-[#ffb86b]/50 hover:bg-white/[0.075]"
          href={comment.permalink}
          key={comment.id}
          rel="noreferrer"
          target="_blank"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-extrabold tracking-widest text-[#ffb86b] uppercase">r/{comment.subreddit}</span>
              <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-[#ffe6f0]">{comment.body}</p>
            </div>
            <span className="shrink-0 rounded-2xl bg-[#ffb86b]/15 px-3 py-2 text-sm font-black text-[#ffe7c9]">
              {comment.score}
            </span>
          </div>
          <div className="text-xs font-bold text-[#c9adbd]">{formatDate(comment.createdUtc)} · {comment.linkTitle ?? "comment"}</div>
        </a>
      ))}
    </div>
  );
}
