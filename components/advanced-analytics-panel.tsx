"use client";

import { useEffect, useMemo, useState } from "react";

import type { DashboardInsightsResponse, InsightSeverity, PostingHeatmapCell } from "@/lib/types";
import { cardClass, mutedClass } from "@/lib/ui/styles";
import { compactNumber } from "@/utils/compact-number";

const DAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, index) => index);

type LoadState = "idle" | "loading" | "loaded" | "error";

async function fetchInsights(): Promise<DashboardInsightsResponse> {
  const response = await fetch(`/api/analytics/insights?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load advanced analytics.");
  return (await response.json()) as DashboardInsightsResponse;
}

function severityClass(severity: InsightSeverity): string {
  if (severity === "good") return "status-pill status-panel--ok";
  if (severity === "watch") return "status-pill status-panel--wait";
  return "status-pill";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function signed(value: number | null): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${compactNumber(value)}`;
}

function recommendationLabel(value: string): string {
  if (value === "double-down") return "Double down";
  if (value === "test-more") return "Test more";
  return "Pause";
}

function heatmapKey(dayLabel: string, hour: number): string {
  return `${dayLabel}:${hour}`;
}

function Heatmap({ rows }: { rows: PostingHeatmapCell[] }) {
  const bySlot = useMemo(() => {
    const map = new Map<string, PostingHeatmapCell>();
    rows.forEach((row) => map.set(heatmapKey(row.dayLabel, row.hour), row));
    return map;
  }, [rows]);
  const maxScore = Math.max(...rows.map((row) => row.averageScore), 1);

  if (rows.length === 0) {
    return <p className={mutedClass}>No posting-time data yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div className="grid grid-cols-[64px_repeat(24,minmax(26px,1fr))] gap-1 text-xs">
          <div />
          {HOURS.map((hour) => (
            <div className="text-center font-bold text-[var(--text-muted)]" key={hour}>{hour}</div>
          ))}
          {DAY_ORDER.map((day) => (
            <div className="contents" key={day}>
              <div className="flex items-center font-extrabold text-[var(--text)]">{day}</div>
              {HOURS.map((hour) => {
                const cell = bySlot.get(heatmapKey(day, hour));
                const opacity = cell ? Math.max(0.16, Math.min(0.92, cell.averageScore / maxScore)) : 0.04;
                return (
                  <div
                    className="h-8 rounded-[8px] border border-[var(--border)] text-center text-[10px] font-extrabold text-[var(--text)]"
                    key={`${day}-${hour}`}
                    style={{ background: `rgba(255, 79, 145, ${opacity})` }}
                    title={cell ? `${day} ${hour}:00 UTC · ${cell.posts} posts · ${cell.averageScore} avg score · ${cell.totalComments} comments` : `${day} ${hour}:00 UTC · no posts`}
                  >
                    {cell?.posts ? compactNumber(cell.averageScore) : ""}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdvancedAnalyticsPanel() {
  const [state, setState] = useState<LoadState>("idle");
  const [data, setData] = useState<DashboardInsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState("loading");
      setError(null);
      try {
        const result = await fetchInsights();
        if (!cancelled) {
          setData(result);
          setState("loaded");
        }
      } catch (loadError) {
        if (!cancelled) {
          setState("error");
          setError(loadError instanceof Error ? loadError.message : "Unable to load advanced analytics.");
        }
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="grid gap-4">
      <section className={`${cardClass} p-5`}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="ui-eyebrow">Insight feed</span>
            <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">What changed and why it matters</h2>
            <p className={mutedClass}>Rule-based insights from scans, profile metric snapshots, post deep dives, and subreddit performance.</p>
          </div>
          <span className="status-pill">{state === "loading" ? "Refreshing" : "Live"}</span>
        </div>
        {state === "error" ? <p className="text-[var(--issue)]">{error}</p> : null}
        {state === "loaded" && data?.insights.length === 0 ? <p className={mutedClass}>No insights yet. Run a scan and let the extension save a few metric points.</p> : null}
        <div className="grid gap-3 lg:grid-cols-2">
          {data?.insights.map((insight) => (
            <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4" key={insight.id}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <strong className="text-[var(--text)]">{insight.title}</strong>
                <span className={severityClass(insight.severity)}>{insight.severity}</span>
              </div>
              <p className="mb-2 text-sm leading-relaxed text-[var(--text-muted)]">{insight.detail}</p>
              <small className="font-bold text-[var(--text-muted)]">{formatDateTime(insight.timestamp)}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <article className={`${cardClass} overflow-hidden p-5`}>
          <div className="mb-4">
            <span className="ui-eyebrow">Attribution</span>
            <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Post impact</h2>
            <p className={mutedClass}>Ranks posts by score, comments, deep-dive refreshes, and any follower/karma movement seen near the post time.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
              <thead>
                <tr className="text-[var(--text-muted)]">
                  <th className="px-3 py-2">Post</th>
                  <th className="px-3 py-2">Subreddit</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-right">Comments</th>
                  <th className="px-3 py-2 text-right">Followers</th>
                  <th className="px-3 py-2 text-right">Impact</th>
                </tr>
              </thead>
              <tbody>
                {data?.postImpacts.map((post) => (
                  <tr className="bg-[var(--surface-muted)] text-[var(--text)]" key={post.id}>
                    <td className="rounded-l-[14px] px-3 py-3">
                      <a className="font-extrabold text-[var(--text)] underline-offset-4 hover:underline" href={post.permalink} target="_blank" rel="noreferrer">{post.title}</a>
                      <small className="mt-1 block text-[var(--text-muted)]">{formatDateTime(post.createdAt)} · confidence {post.confidence}</small>
                    </td>
                    <td className="px-3 py-3 font-bold">r/{post.subreddit}</td>
                    <td className="px-3 py-3 text-right font-bold">{compactNumber(post.refreshedScore ?? post.score)}</td>
                    <td className="px-3 py-3 text-right font-bold">{compactNumber(post.refreshedComments ?? post.comments)}</td>
                    <td className="px-3 py-3 text-right font-bold">{signed(post.followerGain)}</td>
                    <td className="rounded-r-[14px] px-3 py-3 text-right font-extrabold">{compactNumber(post.impactScore)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {state === "loaded" && data?.postImpacts.length === 0 ? <p className={mutedClass}>No post impact rows yet.</p> : null}
          </div>
        </article>

        <article className={`${cardClass} overflow-hidden p-5`}>
          <div className="mb-4">
            <span className="ui-eyebrow">Subreddit ROI</span>
            <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Where to double down</h2>
            <p className={mutedClass}>Ranks communities by score, comments, sample size, and attributed follower movement.</p>
          </div>
          <div className="grid gap-3">
            {data?.subredditRoi.map((row) => (
              <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4" key={row.subreddit}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <strong className="block text-[var(--text)]">r/{row.subreddit}</strong>
                    <small className="text-[var(--text-muted)]">{row.posts} posts · {row.comments} comments</small>
                  </div>
                  <span className={row.recommendation === "pause" ? "status-pill status-panel--wait" : "status-pill status-panel--ok"}>{recommendationLabel(row.recommendation)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div><span className="block text-[var(--text-muted)]">ROI</span><strong>{row.roiScore}</strong></div>
                  <div><span className="block text-[var(--text-muted)]">Avg score</span><strong>{compactNumber(row.averagePostScore)}</strong></div>
                  <div><span className="block text-[var(--text-muted)]">Followers</span><strong>{signed(row.followerGain)}</strong></div>
                </div>
              </article>
            ))}
            {state === "loaded" && data?.subredditRoi.length === 0 ? <p className={mutedClass}>No subreddit ROI data yet.</p> : null}
          </div>
        </article>
      </section>

      <section className={`${cardClass} overflow-hidden p-5`}>
        <div className="mb-4">
          <span className="ui-eyebrow">Timing</span>
          <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Posting-time heatmap</h2>
          <p className={mutedClass}>UTC day/hour slots. Brighter cells mean a higher average captured score.</p>
        </div>
        <Heatmap rows={data?.heatmap ?? []} />
      </section>
    </section>
  );
}
