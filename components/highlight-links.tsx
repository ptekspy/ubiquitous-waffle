import type { RedditComment, RedditPost } from "@/lib/types";
import { mutedClass } from "@/lib/ui/styles";
import { numberFormat } from "@/utils/number-format";

export type HighlightLinksProps = {
  posts: RedditPost[];
  comments: RedditComment[];
};

export function HighlightLinks({ posts, comments }: HighlightLinksProps) {
  return (
    <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
      <article className="overflow-hidden rounded-[28px] border border-white/12 bg-white/[0.07] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-[18px]">
        <h2 className="mb-4 text-xl font-black tracking-[-0.03em]">Top activity</h2>
        <div className="grid gap-3">
          {posts.map((post) => (
            <a className="block rounded-2xl border border-white/12 bg-white/5 p-3.5 no-underline transition hover:border-[#ff4f91]/55" href={post.permalink} target="_blank" rel="noreferrer" key={post.id}>
              <strong className="mb-1.5 block leading-snug">{post.title}</strong>
              <span className="block text-sm text-[#c9adbd]">r/{post.subreddit} · {numberFormat(post.score)} score · {post.numComments} comments</span>
            </a>
          ))}
        </div>
      </article>
      <article className="overflow-hidden rounded-[28px] border border-white/12 bg-white/[0.07] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-[18px]">
        <h2 className="mb-4 text-xl font-black tracking-[-0.03em]">Conversation signal</h2>
        {comments.length === 0 ? (
          <p className={mutedClass}>No comments were captured in this import.</p>
        ) : (
          <div className="grid gap-3">
            {comments.map((comment) => (
              <a className="block rounded-2xl border border-white/12 bg-white/5 p-3.5 no-underline transition hover:border-[#ff4f91]/55" href={comment.permalink} target="_blank" rel="noreferrer" key={comment.id}>
                <strong className="mb-1.5 block leading-snug">{comment.linkTitle ?? `Comment in r/${comment.subreddit}`}</strong>
                <span className="block text-sm text-[#c9adbd]">r/{comment.subreddit} · {numberFormat(comment.score)} score</span>
              </a>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
