import type { AnalyzeResponse } from "@/lib/types";
import { cardClass, mutedClass } from "@/lib/ui/styles";
import { compactNumber } from "@/utils/compact-number";
import { formatDate } from "@/utils/format-date";
import { numberFormat } from "@/utils/number-format";
import { AccountMetricTrendCard } from "./account-metric-trend-card";
import { AdvancedAnalyticsPanel } from "./advanced-analytics-panel";
import { ContentTypeList } from "./content-type-list";
import { DaresTrackerPanel } from "./dares-tracker-panel";
import { DashboardHealthCard } from "./dashboard-health-card";
import { PanelHeading } from "./panel-heading";
import { PlannerCard } from "./planner-card";
import { PostInsightsPanel } from "./post-insights-panel";
import { StatCard } from "./stat-card";
import { SubredditTable } from "./subreddit-table";
import { Timeline } from "./timeline";
import { TopCommentsList } from "./top-comments-list";
import { TopPostsList } from "./top-posts-list";
import { WarningCard } from "./warning-card";

export type DashboardProps = {
  data: AnalyzeResponse;
};

export function Dashboard({ data }: DashboardProps) {
  return (
    <section className="grid gap-4" id="overview">
      <WarningCard warnings={data.warnings} />
      <DashboardHealthCard analytics={data.analytics} />
      <section id="trends" className="analytics-section">
        <AccountMetricTrendCard />
      </section>
      <PostInsightsPanel />
      <section id="intelligence" className="analytics-section">
        <AdvancedAnalyticsPanel />
      </section>
      <DaresTrackerPanel />
      <PlannerCard initialJob={data.plannerJob} />

      <section className={`${cardClass} flex items-center justify-between gap-5 p-5 max-sm:flex-col max-sm:items-stretch`}>
        <div>
          <span className="ui-eyebrow">Latest scan</span>
          <h2 className="my-2 text-3xl font-extrabold tracking-[-0.05em] text-[var(--text)]">u/{data.profile.username}</h2>
          <p className={mutedClass}>Profile created {formatDate(data.profile.createdUtc)}</p>
          <p className={mutedClass}>Scan fetched {formatDate(Math.floor(new Date(data.analytics.fetchedAt).getTime() / 1000))}</p>
        </div>
        <div className="min-w-[188px] rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-right max-sm:text-left">
          <span className="block text-sm text-[var(--text-muted)]">Total karma</span>
          <strong className="mt-1 block text-3xl font-extrabold text-[var(--text)]">{numberFormat(data.profile.totalKarma)}</strong>
        </div>
      </section>

      <div className="stat-grid">
        <StatCard label="Captured posts" value={numberFormat(data.analytics.summary.posts)} detail="Cleaned public rows" />
        <StatCard label="Captured comments" value={numberFormat(data.analytics.summary.comments)} detail="When available" />
        <StatCard label="Avg post score" value={String(data.analytics.summary.averagePostScore)} />
        <StatCard label="Best subreddit" value={data.analytics.summary.bestSubreddit ? `r/${data.analytics.summary.bestSubreddit}` : "N/A"} />
        <StatCard label="Best UTC hour" value={data.analytics.summary.bestPostingHourUtc === null ? "N/A" : `${data.analytics.summary.bestPostingHourUtc}:00`} detail="From captured posts" />
        <StatCard label="Captured score" value={compactNumber(data.analytics.summary.totalPostScore)} />
      </div>

      <section className={`${cardClass} analytics-section p-5`}>
        <PanelHeading eyebrow="Actionable readout" title="Next moves" />
        {data.analytics.recommendations.length === 0 ? (
          <p className={mutedClass}>Not enough public data for recommendations yet.</p>
        ) : (
          <ul className="grid gap-2.5 pl-5 leading-relaxed text-[var(--text)]">
            {data.analytics.recommendations.map((recommendation) => (
              <li className="list-disc" key={recommendation}>{recommendation}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]" id="subreddits">
        <article className={`${cardClass} analytics-section overflow-hidden p-5`}>
          <PanelHeading eyebrow="Where it works" title="Subreddit performance" />
          <SubredditTable rows={data.analytics.subreddits} />
        </article>
        <article className={`${cardClass} analytics-section overflow-hidden p-5`}>
          <PanelHeading eyebrow="Format signal" title="Content formats" />
          <ContentTypeList rows={data.analytics.contentTypes} />
        </article>
      </section>

      <section className={`${cardClass} analytics-section overflow-hidden p-5`}>
        <PanelHeading eyebrow="Momentum" title="Recent activity score" />
        <Timeline rows={data.analytics.timeline} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]" id="posts">
        <article className={`${cardClass} analytics-section overflow-hidden p-5`}>
          <PanelHeading eyebrow="Content intelligence" title="Top posts" />
          <TopPostsList posts={data.analytics.topPosts} />
        </article>
        <article className={`${cardClass} analytics-section overflow-hidden p-5`} id="comments">
          <PanelHeading eyebrow="Engagement" title="Top comments" />
          <TopCommentsList comments={data.analytics.topComments} />
        </article>
      </section>
    </section>
  );
}
