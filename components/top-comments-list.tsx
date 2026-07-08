import type { RedditComment } from "@/lib/types";
import { formatDate } from "@/utils/format-date";

export type TopCommentsListProps = {
  comments: RedditComment[];
};

export function TopCommentsList({ comments }: TopCommentsListProps) {
  if (comments.length === 0) {
    return <p className="text-[var(--text-muted)]">No comments captured yet.</p>;
  }

  return (
    <div className="grid gap-3">
      {comments.slice(0, 6).map((comment) => (
        <a
          className="grid gap-2 rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-[var(--text)] no-underline transition hover:border-[var(--accent)]"
          href={comment.permalink}
          key={comment.id}
          rel="noreferrer"
          target="_blank"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-extrabold tracking-widest text-[var(--accent-strong)] uppercase">r/{comment.subreddit}</span>
              <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-[var(--text)]">{comment.body}</p>
            </div>
            <span className="shrink-0 rounded-[14px] bg-[var(--accent-soft)] px-3 py-2 text-sm font-extrabold text-[var(--accent-strong)]">
              {comment.score}
            </span>
          </div>
          <div className="text-xs font-bold text-[var(--text-muted)]">{formatDate(comment.createdUtc)} · {comment.linkTitle ?? "comment"}</div>
        </a>
      ))}
    </div>
  );
}
