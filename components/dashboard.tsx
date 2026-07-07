import type { AnalyzeResponse } from "@/lib/types";
import { cardClass, mutedClass } from "@/lib/ui/styles";
import { compactNumber } from "@/utils/compact-number";
import { formatDate } from "@/utils/format-date";
import { numberFormat } from "@/utils/number-format";
import { ContentTypeList } from "./content-type-list";
import { PanelHeading } from "./panel-heading";
import { StatCard } from "./stat-card";
import { SubredditTable } from "./subreddit-table";
import { Timeline } from "./timeline";
import { WarningCard } from "./warning-card";

export type DashboardProps = {
  data: AnalyzeResponse;
};

export function Dashboard({ data }: DashboardProps) {
  return (
    <section className="grid gap-[22px]">
      <WarningCard warnings={data.warnings} />

      <div className={`${cardClass} flex items-center justify-between gap-5 p-[26px] max-sm:flex-col max-sm:items-stretch`}>
        <div>
          <span className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#ffb86b]">Latest scan</span>
          <h2 className="my-2 text-[clamp(2rem,4vw,3.2rem)] font-black tracking-[-0.05em]">u/{data.profile.username}</h2>
          <p className={mutedClass}>Profile created {formatDate(data.profile.createdUtc)}</p>
        </div>
        <div className="min-w-[188px] rounded-3xl bg-linear-to-br from-[#ff4f91]/[0.22] to-[#ffb86b]/[0.22] p-[18px] text-right max-sm:text-left">
          <span className="block text-sm text-[#c9adbd]">Total karma</span>
          <strong className="mt-1 block text-3xl font-black">{numberFormat(data.profile.totalKarma)}</strong>
        </div>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard label="Captured posts" value={numberFormat(data.analytics.summary.posts)} detail="Cleaned public rows" />
        <StatCard label="Captured comments" value={numberFormat(data.analytics.summary.comments)} detail="When available" />
        <StatCard label="Avg post score" value={String(data.analytics.summary.averagePostScore)} />
        <StatCard label="Best subreddit" value={data.analytics.summary.bestSubreddit ? `r/${data.analytics.summary.bestSubreddit}` : "N/A"} />
        <StatCard
          label="Best UTC hour"
          value={data.analytics.summary.bestPostingHourUtc === null ? "N/A" : `${data.analytics.summary.bestPostingHourUtc}:00`}
          detail="From captured posts"
        />
        <StatCard label="Captured score" value={compactNumber(data.analytics.summary.totalPostScore)} />
      </div>

      <section className={`${cardClass} bg-linear-to-br from-[#ff4f91]/[0.16] to-[#ffb86b]/10 p-6`}>
        <PanelHeading eyebrow="Actionable readout" title="Next moves" />
        {data.analytics.recommendations.length === 0 ? (
          <p className={mutedClass}>Not enough public data for recommendations yet.</p>
        ) : (
          <ul className="grid gap-2.5 pl-5 leading-relaxed text-[#ffe6f0]">
            {data.analytics.recommendations.map((recommendation) => (
              <li className="list-disc" key={recommendation}>{recommendation}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3.5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <article className={`${cardClass} overflow-hidden p-6`}>
          <PanelHeading eyebrow="Where it works" title="Subreddit performance" />
          <SubredditTable rows={data.analytics.subreddits} />
        </article>
        <article className={`${cardClass} overflow-hidden p-6`}>
          <PanelHeading eyebrow="Format signal" title="Content formats" />
          <ContentTypeList rows={data.analytics.contentTypes} />
        </article>
      </section>

      <section className={`${cardClass} overflow-hidden p-6`}>
        <PanelHeading eyebrow="Momentum" title="Recent activity score" />
        <Timeline rows={data.analytics.timeline} />
      </section>

      <section className="grid gap-3.5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <article className={`${cardClass} overflow-hidden p-6`}>
          <PanelHeading eyebrow="Repeat patterns" title="Top posts" />
          <div className="grid gap-3">
            {data.analytics.topPosts.map((post) => (
              <a className="block rounded-2xl border border-white/12 bg-white/5 p-3.5 no-underline transition hover:border-[#ff4f91]/55" href={post.permalink} target="_blank" rel="noreferrer" key={post.id}>
                <strong className="mb-1.5 block leading-snug">{post.title}</strong>
                <span className="block text-sm text-[#c9adbd]">r/{post.subreddit} · {numberFormat(post.score)} score · {post.numComments} comments</span>
              </a>
            ))}
          </div>
        </article>
        <article className={`${cardClass} overflow-hidden p-6`}>
          <PanelHeading eyebrow="Conversation signal" title="Top comments" />
          {data.analytics.topComments.length === 0 ? (
            <p className={mutedClass}>No comments were captured in this browser import.</p>
          ) : (
            <div className="grid gap-3">
              {data.analytics.topComments.map((comment) => (
                <a className="block rounded-2xl border border-white/12 bg-white/5 p-3.5 no-underline transition hover:border-[#ff4f91]/55" href={comment.permalink} target="_blank" rel="noreferrer" key={comment.id}>
                  <strong className="mb-1.5 block leading-snug">{comment.linkTitle ?? `Comment in r/${comment.subreddit}`}</strong>
                  <span className="block text-sm text-[#c9adbd]">r/{comment.subreddit} · {numberFormat(comment.score)} score</span>
                </a>
              ))}
            </div>
          )}
        </article>
      </section>
    </section>
  );
}
