"use client";

import { useEffect, useMemo, useState } from "react";

import type { HistoricalPerformancePoint, HistoricalPerformanceResponse, HistoricalRangePreset } from "@/lib/types";
import { cardClass, mutedClass } from "@/lib/ui/styles";
import { compactNumber } from "@/utils/compact-number";

type LoadState = "idle" | "loading" | "loaded" | "error";
type MetricKey = "scoreDelta" | "cumulativeScore" | "postScore" | "commentScore" | "postsCreated" | "commentsMade" | "repliesReceived" | "viewsDelta";

type SnapshotSummary = {
  id: string;
  capturedAt: string;
  importedAt: string;
  source: string;
  sourceFileName: string | null;
  postCount: number;
  commentCount: number;
};

type ImportResult = {
  snapshotId: string;
  capturedAt: string;
  source: string;
  sourceFileName: string | null;
  postCount: number;
  commentCount: number;
  username: string | null;
};

const presets: Array<{ key: HistoricalRangePreset; label: string }> = [
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "180d", label: "180d" },
  { key: "365d", label: "1y" },
  { key: "all", label: "All" },
];

const metrics: Array<{ key: MetricKey; label: string; help: string }> = [
  { key: "scoreDelta", label: "Total score", help: "Backfilled post/comment score plus observed deltas." },
  { key: "cumulativeScore", label: "Cumulative", help: "Running estimated content score." },
  { key: "postScore", label: "Post score", help: "Post score backfilled to post date, then deltas by observation date." },
  { key: "commentScore", label: "Comment score", help: "Comment score backfilled to comment date." },
  { key: "postsCreated", label: "Posts", help: "Posts created by day." },
  { key: "commentsMade", label: "Comments made", help: "Comments made by day." },
  { key: "repliesReceived", label: "Replies", help: "Comment count movement on posts." },
  { key: "viewsDelta", label: "Comment views", help: "Visible comment view deltas from Reddit HTML snapshots, when present." },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowTime(): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
}

function dateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function metricValue(point: HistoricalPerformancePoint, metric: MetricKey): number | null {
  const value = point[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function chartPath(points: Array<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function HistoricalChart({ points, metric }: { points: HistoricalPerformancePoint[]; metric: MetricKey }) {
  const values = points.map((point) => metricValue(point, metric)).filter((value): value is number => value !== null);
  if (values.length < 2) return <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-6 text-sm text-[var(--text-muted)]">Import more snapshots to draw this graph.</div>;

  const width = 860;
  const height = 320;
  const left = 66;
  const right = 24;
  const top = 26;
  const bottom = 52;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const range = Math.max(1, max - min);
  const chartPoints = values.map((value, index) => ({
    x: left + (index / Math.max(1, values.length - 1)) * plotWidth,
    y: top + (1 - (value - min) / range) * plotHeight,
    value,
    label: points[index]?.label ?? "",
  }));
  const path = chartPath(chartPoints);
  const latest = values.at(-1) ?? 0;
  const first = values[0] ?? 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
      <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
        <svg className="h-[320px] w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metric} historical chart`}>
          <defs>
            <linearGradient id="historicalArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0" /></linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = top + tick * plotHeight;
            const value = max - tick * range;
            return <g key={tick}><line x1={left} x2={width - right} y1={y} y2={y} stroke="var(--border)" /><text x={left - 10} y={y + 4} textAnchor="end" fontSize="12" fill="var(--text-muted)">{compactNumber(Math.round(value))}</text></g>;
          })}
          <path d={`${path} L${chartPoints.at(-1)?.x ?? left} ${height - bottom} L${left} ${height - bottom} Z`} fill="url(#historicalArea)" />
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {chartPoints.filter((_, index) => index === 0 || index === Math.floor(chartPoints.length / 2) || index === chartPoints.length - 1).map((point) => <g key={`${point.label}-${point.x}`}><circle cx={point.x} cy={point.y} r="4" fill="var(--accent)" /><text x={point.x} y={height - 18} textAnchor="middle" fontSize="12" fill="var(--text-muted)">{point.label}</text></g>)}
        </svg>
      </div>
      <aside className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
        <span className="ui-eyebrow">Range change</span>
        <strong className="mt-2 block text-3xl text-[var(--text)]">{compactNumber(latest - first)}</strong>
        <p className="mt-2 text-sm text-[var(--text-muted)]">Latest: {compactNumber(latest)}</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">First: {compactNumber(first)}</p>
      </aside>
    </div>
  );
}

async function fetchHistory(preset: HistoricalRangePreset, from: string, to: string): Promise<HistoricalPerformanceResponse> {
  const params = new URLSearchParams({ preset, ts: String(Date.now()) });
  if (preset === "custom" && from) params.set("from", from);
  if (preset === "custom" && to) params.set("to", to);
  const response = await fetch(`/api/history/performance?${params}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load historical performance.");
  return (await response.json()) as HistoricalPerformanceResponse;
}

async function fetchSnapshots(): Promise<SnapshotSummary[]> {
  const response = await fetch(`/api/history/snapshots/import?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) return [];
  const payload = await response.json();
  return Array.isArray(payload.snapshots) ? payload.snapshots : [];
}

export function HistoricalAnalyticsPanel() {
  const [preset, setPreset] = useState<HistoricalRangePreset>("90d");
  const [metric, setMetric] = useState<MetricKey>("scoreDelta");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today());
  const [capturedDate, setCapturedDate] = useState(today());
  const [capturedTime, setCapturedTime] = useState(nowTime());
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sourceFileName, setSourceFileName] = useState("");
  const [state, setState] = useState<LoadState>("idle");
  const [importState, setImportState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoricalPerformanceResponse | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);

  async function load() {
    setState("loading");
    setError(null);
    try {
      const [nextHistory, nextSnapshots] = await Promise.all([fetchHistory(preset, from, to), fetchSnapshots()]);
      setHistory(nextHistory);
      setSnapshots(nextSnapshots);
      setState("loaded");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load historical analytics.");
      setState("error");
    }
  }

  async function submitImport() {
    setImportState("loading");
    setImportMessage(null);
    setError(null);

    const form = new FormData();
    form.set("capturedDate", capturedDate);
    form.set("capturedTime", capturedTime);
    form.set("timezone", "Europe/London");
    if (file) form.set("file", file);
    if (!file && content.trim()) form.set("content", content);
    if (sourceFileName.trim()) form.set("sourceFileName", sourceFileName.trim());

    try {
      const response = await fetch("/api/history/snapshots/import", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to import snapshot.");
      const result = payload as ImportResult;
      setImportMessage(`Imported ${result.postCount} posts and ${result.commentCount} comments from ${result.sourceFileName ?? result.source}.`);
      setImportState("loaded");
      setContent("");
      setFile(null);
      await load();
    } catch (importError) {
      setImportState("error");
      setError(importError instanceof Error ? importError.message : "Unable to import snapshot.");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const selectedMetric = metrics.find((item) => item.key === metric) ?? metrics[0];
  const points = history?.points ?? [];
  const summaryCards = useMemo(() => [
    ["Score", history?.summary.scoreDelta ?? 0],
    ["Post score", history?.summary.postScore ?? 0],
    ["Comment score", history?.summary.commentScore ?? 0],
    ["Posts", history?.summary.postsCreated ?? 0],
    ["Comments", history?.summary.commentsMade ?? 0],
    ["Replies", history?.summary.repliesReceived ?? 0],
  ] as Array<[string, number]>, [history]);

  return (
    <section className={`${cardClass} grid gap-5 p-5`} id="historical-analytics">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <span className="ui-eyebrow">Historical analytics</span>
          <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Backfilled score and comment history</h2>
          <p className={mutedClass}>Import dated Reddit HTML/TXT snapshots. First observed scores are backfilled to the post/comment date; later changes are counted on the observation date.</p>
        </div>
        <span className="status-pill">{state === "loading" ? "Refreshing" : `${snapshots.length} snapshots`}</span>
      </div>

      {error ? <p className="rounded-[14px] border border-[var(--border)] bg-[var(--issue-soft)] p-3 text-sm font-bold text-[var(--issue)]">{error}</p> : null}
      {importMessage ? <p className="rounded-[14px] border border-[var(--border)] bg-[var(--ok-soft)] p-3 text-sm font-bold text-[var(--ok)]">{importMessage}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <h3 className="mb-3 text-lg font-extrabold text-[var(--text)]">Import snapshot</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-bold text-[var(--text-muted)]">Snapshot date<input className="input-field" type="date" value={capturedDate} onChange={(event) => setCapturedDate(event.target.value)} /></label>
            <label className="grid gap-1 text-sm font-bold text-[var(--text-muted)]">Snapshot time<input className="input-field" type="time" value={capturedTime} onChange={(event) => setCapturedTime(event.target.value)} /></label>
          </div>
          <label className="mt-3 grid gap-1 text-sm font-bold text-[var(--text-muted)]">TXT / HTML file<input className="input-field" type="file" accept=".txt,.html,.htm,text/plain,text/html" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
          <label className="mt-3 grid gap-1 text-sm font-bold text-[var(--text-muted)]">Optional label<input className="input-field" placeholder="Jul 7 18:58 profile HTML" value={sourceFileName} onChange={(event) => setSourceFileName(event.target.value)} /></label>
          <label className="mt-3 grid gap-1 text-sm font-bold text-[var(--text-muted)]">Or paste HTML / JSON<textarea className="input-field min-h-[150px]" placeholder="Paste the Reddit profile HTML, .txt contents, or old PaidPolitely JSON capture here" value={content} onChange={(event) => setContent(event.target.value)} /></label>
          <button className="button-primary mt-3" type="button" disabled={importState === "loading" || (!file && !content.trim())} onClick={() => void submitImport()}>{importState === "loading" ? "Importing…" : "Import historical snapshot"}</button>
        </article>

        <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="m-0 text-lg font-extrabold text-[var(--text)]">Graph controls</h3>
            <button className="button-secondary min-h-10 px-3" type="button" onClick={() => void load()}>Refresh</button>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {presets.map((item) => <button className={item.key === preset ? "rounded-[12px] bg-[var(--accent-soft)] px-3 py-2 text-sm font-extrabold text-[var(--accent-strong)]" : "rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-extrabold text-[var(--text-muted)]"} key={item.key} type="button" onClick={() => setPreset(item.key)}>{item.label}</button>)}
            <button className={preset === "custom" ? "rounded-[12px] bg-[var(--accent-soft)] px-3 py-2 text-sm font-extrabold text-[var(--accent-strong)]" : "rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-extrabold text-[var(--text-muted)]"} type="button" onClick={() => setPreset("custom")}>Custom</button>
          </div>
          {preset === "custom" ? <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><input className="input-field" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /><input className="input-field" type="date" value={to} onChange={(event) => setTo(event.target.value)} /><button className="button-secondary" type="button" onClick={() => void load()}>Apply</button></div> : null}
          <div className="mb-3 flex flex-wrap gap-2">
            {metrics.map((item) => <button className={item.key === metric ? "rounded-[12px] bg-[var(--accent-soft)] px-3 py-2 text-sm font-extrabold text-[var(--accent-strong)]" : "rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-extrabold text-[var(--text-muted)]"} key={item.key} type="button" onClick={() => setMetric(item.key)}>{item.label}</button>)}
          </div>
          <p className="text-sm text-[var(--text-muted)]">{selectedMetric.help}</p>
        </article>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {summaryCards.map(([label, value]) => <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4" key={label}><span className="text-sm text-[var(--text-muted)]">{label}</span><strong className="mt-1 block text-2xl text-[var(--text)]">{compactNumber(value)}</strong></div>)}
      </div>

      <HistoricalChart points={points} metric={metric} />

      {snapshots.length > 0 ? <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4"><h3 className="mb-3 text-lg font-extrabold text-[var(--text)]">Recent imports</h3><div className="grid gap-2">{snapshots.slice(0, 6).map((snapshot) => <div className="flex flex-col gap-1 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-3 sm:flex-row sm:items-center sm:justify-between" key={snapshot.id}><div><strong className="text-[var(--text)]">{snapshot.sourceFileName ?? snapshot.source}</strong><small className="block text-[var(--text-muted)]">Captured {dateTime(snapshot.capturedAt)} · imported {dateTime(snapshot.importedAt)}</small></div><span className="status-pill">{snapshot.postCount} posts · {snapshot.commentCount} comments</span></div>)}</div></div> : null}
    </section>
  );
}
