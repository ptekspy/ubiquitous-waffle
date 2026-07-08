import type { AccountAnalytics } from "@/lib/types";
import { cardClass, mutedClass } from "@/lib/ui/styles";
import { compactNumber } from "@/utils/compact-number";

export type DashboardHealthCardProps = {
  analytics: AccountAnalytics;
};

function scorePerPost(analytics: AccountAnalytics): string {
  const posts = analytics.summary.posts;
  if (posts === 0) return "0";
  return compactNumber(Math.round(analytics.summary.totalPostScore / posts));
}

function commentRate(analytics: AccountAnalytics): string {
  const posts = analytics.summary.posts;
  if (posts === 0) return "0";
  return `${Math.round((analytics.summary.comments / posts) * 10) / 10} per post`;
}

export function DashboardHealthCard({ analytics }: DashboardHealthCardProps) {
  const bestSubreddit = analytics.summary.bestSubreddit ? `r/${analytics.summary.bestSubreddit}` : "Not enough data";
  const bestHour = analytics.summary.bestPostingHourUtc === null ? "Unknown" : `${analytics.summary.bestPostingHourUtc}:00 UTC`;

  return (
    <section className={`${cardClass} grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(150px,0.4fr))]`}>
      <div>
        <span className="ui-eyebrow">Dashboard health</span>
        <h2 className="mt-2 mb-2 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Current account signal</h2>
        <p className={`${mutedClass} leading-relaxed`}>This is the latest saved scan for this workspace. Refreshing the scan replaces the live readout while keeping history in PostgreSQL.</p>
      </div>
      <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
        <span className="block text-sm text-[var(--text-muted)]">Best lane</span>
        <strong className="mt-2 block text-xl text-[var(--text)]">{bestSubreddit}</strong>
      </div>
      <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
        <span className="block text-sm text-[var(--text-muted)]">Best time</span>
        <strong className="mt-2 block text-xl text-[var(--text)]">{bestHour}</strong>
      </div>
      <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
        <span className="block text-sm text-[var(--text-muted)]">Score / comments</span>
        <strong className="mt-2 block text-xl text-[var(--text)]">{scorePerPost(analytics)}</strong>
        <small className="text-[var(--text-muted)]">{commentRate(analytics)}</small>
      </div>
    </section>
  );
}
