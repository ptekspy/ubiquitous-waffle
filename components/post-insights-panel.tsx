"use client";

import { useEffect, useMemo, useState } from "react";

import type { PostInsightPoint, PostInsightRow, PostInsightsResponse } from "@/lib/types";
import { cardClass, mutedClass } from "@/lib/ui/styles";
import { compactNumber } from "@/utils/compact-number";

type LoadState = "idle" | "loading" | "loaded" | "error";
type MetricKey = "viewCount" | "score" | "comments" | "shareCount";

const metricOptions: Array<{ key: MetricKey; label: string }> = [
  { key: "viewCount", label: "Views" },
  { key: "score", label: "Karma" },
  { key: "comments", label: "Comments" },
  { key: "shareCount", label: "Shares" },
];

async function fetchPostInsights(): Promise<PostInsightsResponse> {
  const response = await fetch(`/api/posts/insights?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load post insights.");
  return (await response.json()) as PostInsightsResponse;
}

function dateTime(value: string | null): string {
  if (!value) return "Not captured yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function metricValue(point: PostInsightPoint, metric: MetricKey): number | null {
  const value = point[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function latestMetric(row: PostInsightRow, metric: MetricKey): number | null {
  if (metric === "viewCount") return row.latestViews;
  if (metric === "shareCount") return row.latestShares;
  if (metric === "score") return row.latestScore ?? row.score;
  return row.latestComments ?? row.comments;
}

function delta(points: PostInsightPoint[], metric: MetricKey): number | null {
  const values = points.map((point) => metricValue(point, metric)).filter((value): value is number => value !== null);
  if (values.length < 2) return null;
  return values[values.length - 1] - values[0];
}

function signed(value: number | null): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${compactNumber(value)}`;
}

function Sparkline({ points, metric }: { points: PostInsightPoint[]; metric: MetricKey }) {
  const values = points.map((point) => metricValue(point, metric)).filter((value): value is number => value !== null);
  if (values.length < 2) return <span className="text-sm text-[var(--text-muted)]">Waiting for more points</span>;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const width = 220;
  const height = 64;
  const path = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");

  return (
    <svg className="h-16 w-full max-w-[240px] overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metric} sparkline`}>
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={height - ((values[values.length - 1] - min) / range) * height} r="4" fill="var(--accent)" />
    </svg>
  );
}

export function PostInsightsPanel() {
  const [state, setState] = useState<LoadState>("idle");
  const [data, setData] = useState<PostInsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>("viewCount");

  async function load() {
    setState("loading");
    setError(null);
    try {
      const result = await fetchPostInsights();
      setData(result);
      setState("loaded");
    } catch (loadError) {
      setState("error");
      setError(loadError instanceof Error ? loadError.message : "Unable to load post insights.");
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const rows = useMemo(() => [...(data?.rows ?? [])].sort((a, b) => (latestMetric(b, metric) ?? -1) - (latestMetric(a, metric) ?? -1)).slice(0, 12), [data?.rows, metric]);
  const totalViews = data?.rows.reduce((sum, row) => sum + (row.latestViews ?? 0), 0) ?? 0;
  const postsWithViews = data?.rows.filter((row) => row.latestViews !== null).length ?? 0;

  return (
    <section className={`${cardClass} overflow-hidden p-5`} id="post-insights">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <span className="ui-eyebrow">Reddit post insights</span>
          <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Views, karma, comments and shares</h2>
          <p className={mutedClass}>Deep crawl now opens the Reddit post page as your browser session and stores any visible author insight values Reddit exposes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="status-pill">{state === "loading" ? "Refreshing" : "Live"}</span>
          <button className="rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm font-extrabold text-[var(--accent-strong)]" type="button" onClick={() => void load()}>Refresh</button>
        </div>
      </div>

      {state === "error" ? <p className="text-[var(--issue)]">{error}</p> : null}

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4"><span className="block text-sm text-[var(--text-muted)]">Tracked posts</span><strong className="mt-1 block text-3xl text-[var(--text)]">{compactNumber(data?.rows.length ?? 0)}</strong></div>
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4"><span className="block text-sm text-[var(--text-muted)]">Posts with views</span><strong className="mt-1 block text-3xl text-[var(--text)]">{compactNumber(postsWithViews)}</strong></div>
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4"><span className="block text-sm text-[var(--text-muted)]">Latest captured views</span><strong className="mt-1 block text-3xl text-[var(--text)]">{compactNumber(totalViews)}</strong></div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {metricOptions.map((option) => (
          <button className={option.key === metric ? "rounded-[12px] bg-[var(--accent-soft)] px-3 py-2 text-sm font-extrabold text-[var(--accent-strong)]" : "rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-extrabold text-[var(--text-muted)]"} key={option.key} type="button" onClick={() => setMetric(option.key)}>
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {rows.map((row) => (
          <article className="grid gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 xl:grid-cols-[minmax(0,1fr)_240px_180px] xl:items-center" key={row.id}>
            <div>
              <a className="font-extrabold text-[var(--text)] underline-offset-4 hover:underline" href={row.permalink} target="_blank" rel="noreferrer">{row.title}</a>
              <small className="mt-1 block text-[var(--text-muted)]">r/{row.subreddit} · posted {dateTime(row.createdAt)} · insights {dateTime(row.latestInsightAt)}</small>
            </div>
            <Sparkline points={row.history} metric={metric} />
            <div className="grid grid-cols-2 gap-2 text-sm xl:text-right">
              <div><span className="block text-[var(--text-muted)]">Latest</span><strong className="text-[var(--text)]">{latestMetric(row, metric) === null ? "—" : compactNumber(latestMetric(row, metric) ?? 0)}</strong></div>
              <div><span className="block text-[var(--text-muted)]">Δ</span><strong className="text-[var(--text)]">{signed(delta(row.history, metric))}</strong></div>
            </div>
          </article>
        ))}

        {state === "loaded" && rows.length === 0 ? <p className={mutedClass}>No post insight snapshots yet. Run the local queue deep crawl, then reload extension v0.2.8 if views do not appear.</p> : null}
      </div>
    </section>
  );
}
