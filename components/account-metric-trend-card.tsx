"use client";

import { useEffect, useMemo, useState, type PointerEvent } from "react";

import type { AccountMetricEvent, AccountMetricHistory, AccountMetricPoint, HistoricalPerformanceResponse } from "@/lib/types";
import { cardClass, mutedClass } from "@/lib/ui/styles";
import { compactNumber } from "@/utils/compact-number";
import { numberFormat } from "@/utils/number-format";

type WindowKey = AccountMetricHistory["window"];
type LoadState = "idle" | "loading" | "loaded" | "error";
type ObservedMetricKey = "totalKarma" | "linkKarma" | "commentKarma" | "followerCount";
type MetricKey = ObservedMetricKey | "backfilledScore" | "backfilledDailyScore";

type MetricConfig = { key: MetricKey; label: string; axisLabel: string; mode: "observed" | "backfilled" };
type ChartPoint = { index: number; capturedAt: string; value: number; time: number; x: number; y: number };
type ChartScale = { min: number; max: number; ticks: number[] };
type ChartEvent = AccountMetricEvent & { x: number };

const windows: Array<{ key: WindowKey; label: string }> = [
  { key: "hour", label: "Hour" },
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "all", label: "All" },
];

const metrics: MetricConfig[] = [
  { key: "totalKarma", label: "Total karma", axisLabel: "Karma", mode: "observed" },
  { key: "linkKarma", label: "Link karma", axisLabel: "Karma", mode: "observed" },
  { key: "commentKarma", label: "Comment karma", axisLabel: "Karma", mode: "observed" },
  { key: "followerCount", label: "Followers", axisLabel: "Followers", mode: "observed" },
  { key: "backfilledScore", label: "Backfilled score", axisLabel: "Estimated score", mode: "backfilled" },
  { key: "backfilledDailyScore", label: "Daily score", axisLabel: "Estimated daily score", mode: "backfilled" },
];

const observedMetricKeys = new Set<MetricKey>(["totalKarma", "linkKarma", "commentKarma", "followerCount"]);
const chart = { width: 840, height: 340, top: 32, right: 30, bottom: 58, left: 76 };
const plot = {
  left: chart.left,
  top: chart.top,
  width: chart.width - chart.left - chart.right,
  height: chart.height - chart.top - chart.bottom,
  get right() { return this.left + this.width; },
  get bottom() { return this.top + this.height; },
};

async function fetchHistory(windowKey: WindowKey): Promise<AccountMetricHistory> {
  const response = await fetch(`/api/metrics/account?window=${windowKey}&ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load account metric history.");
  return (await response.json()) as AccountMetricHistory;
}

async function fetchBackfilledHistory(): Promise<HistoricalPerformanceResponse> {
  const response = await fetch(`/api/history/performance?preset=all&ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load imported historical score history.");
  return (await response.json()) as HistoricalPerformanceResponse;
}

function metricValue(point: AccountMetricPoint, metricKey: ObservedMetricKey): number | null {
  const value = point[metricKey];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const fraction = rawStep / power;
  if (fraction <= 1) return power;
  if (fraction <= 2) return 2 * power;
  if (fraction <= 5) return 5 * power;
  return 10 * power;
}

function chartScale(values: number[]): ChartScale {
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const paddedMin = rawMin === rawMax ? rawMin - 1 : rawMin;
  const paddedMax = rawMin === rawMax ? rawMax + 1 : rawMax;
  const step = niceStep((paddedMax - paddedMin) / 4);
  const min = rawMin < 0 ? Math.floor(paddedMin / step) * step : Math.max(0, Math.floor(paddedMin / step) * step);
  const max = Math.ceil(paddedMax / step) * step;
  const ticks: number[] = [];
  for (let value = min; value <= max + step / 2; value += step) ticks.push(value);
  return { min, max: Math.max(max, min + step), ticks };
}

function timeValue(value: string): number | null {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function xForTime(time: number, minTime: number, maxTime: number): number {
  const spread = Math.max(maxTime - minTime, 1);
  if (spread <= 1) return plot.left + plot.width / 2;
  return plot.left + ((time - minTime) / spread) * plot.width;
}

function yForValue(value: number, scale: ChartScale): number {
  return plot.bottom - ((value - scale.min) / Math.max(scale.max - scale.min, 1)) * plot.height;
}

function linePath(points: ChartPoint[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function areaPath(points: ChartPoint[]): string {
  if (points.length < 2) return "";
  const first = points[0];
  const last = points.at(-1);
  if (!last) return "";
  return `${linePath(points)} L${last.x.toFixed(2)} ${plot.bottom} L${first.x.toFixed(2)} ${plot.bottom} Z`;
}

function formatTick(value: number): string {
  return Math.abs(value) >= 1_000 ? compactNumber(value) : numberFormat(value);
}

function formatDelta(value: number): string {
  return `${value > 0 ? "+" : ""}${compactNumber(value)}`;
}

function formatPointTime(value: string, windowKey: WindowKey, imported = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (imported || windowKey === "all") return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "2-digit" }).format(date);
  if (windowKey === "week") return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", day: windowKey === "day" ? "numeric" : undefined, month: windowKey === "day" ? "short" : undefined }).format(date);
}

function xAxisLabels(points: ChartPoint[], windowKey: WindowKey, imported = false): Array<{ x: number; label: string }> {
  if (points.length === 0) return [];
  const first = points[0];
  const last = points.at(-1) ?? first;
  const spread = Math.max(last.time - first.time, 1);
  if (spread <= 1) return [{ x: first.x, label: formatPointTime(first.capturedAt, windowKey, imported) }];
  if (points.length <= 4) return points.map((point) => ({ x: point.x, label: formatPointTime(point.capturedAt, windowKey, imported) }));
  const fractions = points.length > 8 ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1];
  return fractions.map((fraction) => {
    const time = first.time + fraction * spread;
    return { x: xForTime(time, first.time, last.time), label: formatPointTime(new Date(time).toISOString(), windowKey, imported) };
  });
}

function eventMarkers(events: AccountMetricEvent[], points: ChartPoint[]): ChartEvent[] {
  if (points.length === 0) return [];
  const minTime = points[0].time;
  const maxTime = points.at(-1)?.time ?? minTime;

  return events
    .map((event) => {
      const eventTime = timeValue(event.capturedAt);
      return eventTime === null ? null : { ...event, x: xForTime(eventTime, minTime, maxTime) };
    })
    .filter((event): event is ChartEvent => Boolean(event) && Number.isFinite(event.x) && event.x >= plot.left && event.x <= plot.right);
}

function latest(points: AccountMetricPoint[]): AccountMetricPoint | null { return points.at(-1) ?? null; }
function first(points: AccountMetricPoint[]): AccountMetricPoint | null { return points[0] ?? null; }

export function AccountMetricTrendCard() {
  const [windowKey, setWindowKey] = useState<WindowKey>("all");
  const [metricKey, setMetricKey] = useState<MetricKey>("totalKarma");
  const [state, setState] = useState<LoadState>("idle");
  const [history, setHistory] = useState<AccountMetricHistory | null>(null);
  const [backfilledHistory, setBackfilledHistory] = useState<HistoricalPerformanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const metric = metrics.find((item) => item.key === metricKey) ?? metrics[0];
  const isBackfilled = metric.mode === "backfilled";

  useEffect(() => {
    const handler = () => setRefreshKey((value) => value + 1);
    window.addEventListener("paidpolitely-account-metrics-refresh", handler);
    return () => window.removeEventListener("paidpolitely-account-metrics-refresh", handler);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState("loading");
      setError(null);
      setActiveIndex(null);
      try {
        const [observed, imported] = await Promise.all([
          fetchHistory(windowKey),
          fetchBackfilledHistory().catch(() => null),
        ]);
        if (!cancelled) {
          setHistory(observed);
          setBackfilledHistory(imported);
          setState("loaded");
        }
      } catch (loadError) {
        if (!cancelled) {
          setState("error");
          setError(loadError instanceof Error ? loadError.message : "Unable to load account metric history.");
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [windowKey, refreshKey]);

  const points = history?.points ?? [];
  const events = isBackfilled ? [] : history?.events ?? [];
  const current = latest(points);
  const start = first(points);
  const karmaDelta = current && start ? current.totalKarma - start.totalKarma : 0;
  const followerDelta = current?.followerCount !== null && current?.followerCount !== undefined && start?.followerCount !== null && start?.followerCount !== undefined ? current.followerCount - start.followerCount : null;

  const chartData = useMemo(() => {
    if (metricKey === "backfilledScore" || metricKey === "backfilledDailyScore") {
      const importedPoints = backfilledHistory?.points ?? [];
      const rows = importedPoints
        .map((point, index) => {
          const capturedAt = `${point.date}T00:00:00.000Z`;
          return { point, index, capturedAt, value: metricKey === "backfilledScore" ? point.cumulativeScore : point.scoreDelta, time: timeValue(capturedAt) };
        })
        .filter((row): row is { point: (typeof importedPoints)[number]; index: number; capturedAt: string; value: number; time: number } => Number.isFinite(row.value) && row.time !== null)
        .sort((a, b) => a.time - b.time);
      if (rows.length === 0) return { points: [] as ChartPoint[], scale: null as ChartScale | null };
      const scale = chartScale(rows.map((row) => row.value));
      const minTime = rows[0].time;
      const maxTime = rows.at(-1)?.time ?? minTime;
      const chartPoints = rows.map((row, index) => ({ index, capturedAt: row.capturedAt, value: row.value, time: row.time, x: xForTime(row.time, minTime, maxTime), y: yForValue(row.value, scale) }));
      return { points: chartPoints, scale };
    }

    if (!observedMetricKeys.has(metricKey)) return { points: [] as ChartPoint[], scale: null as ChartScale | null };
    const rows = points
      .map((point, index) => ({ point, index, value: metricValue(point, metricKey as ObservedMetricKey), time: timeValue(point.capturedAt) }))
      .filter((row): row is { point: AccountMetricPoint; index: number; value: number; time: number } => row.value !== null && row.time !== null)
      .sort((a, b) => a.time - b.time);
    if (rows.length === 0) return { points: [] as ChartPoint[], scale: null as ChartScale | null };
    const scale = chartScale(rows.map((row) => row.value));
    const minTime = rows[0].time;
    const maxTime = rows.at(-1)?.time ?? minTime;
    const chartPoints = rows.map((row, index) => ({ index, capturedAt: row.point.capturedAt, value: row.value, time: row.time, x: xForTime(row.time, minTime, maxTime), y: yForValue(row.value, scale) }));
    return { points: chartPoints, scale };
  }, [backfilledHistory?.points, metricKey, points]);

  const activePoint = activeIndex === null ? null : chartData.points[activeIndex] ?? null;
  const path = useMemo(() => linePath(chartData.points), [chartData.points]);
  const area = useMemo(() => areaPath(chartData.points), [chartData.points]);
  const xLabels = useMemo(() => xAxisLabels(chartData.points, windowKey, isBackfilled), [chartData.points, windowKey, isBackfilled]);
  const markers = useMemo(() => eventMarkers(events, chartData.points), [events, chartData.points]);
  const importedLatest = backfilledHistory?.points.at(-1)?.cumulativeScore ?? null;
  const importedFirst = backfilledHistory?.points[0]?.cumulativeScore ?? null;
  const importedDelta = importedLatest !== null && importedFirst !== null ? importedLatest - importedFirst : null;

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (chartData.points.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * chart.width;
    const nearest = chartData.points.reduce((bestIndex, point, index) => Math.abs(point.x - x) < Math.abs(chartData.points[bestIndex].x - x) ? index : bestIndex, 0);
    setActiveIndex(nearest);
  }

  return (
    <section className={`${cardClass} overflow-hidden p-5`}>
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <span className="ui-eyebrow">Account trend</span>
          <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Karma, followers and imported history</h2>
          <p className={mutedClass}>Imported profile HTML creates dated account points for karma and followers. Scheduled extension scans continue the same graph going forward.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isBackfilled ? (
            <div className="flex rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)] p-1">
              {windows.map((item) => <button className={item.key === windowKey ? "rounded-[10px] bg-[var(--surface)] px-3 py-2 text-sm font-extrabold text-[var(--accent-strong)] shadow-[var(--shadow-soft)]" : "rounded-[10px] px-3 py-2 text-sm font-extrabold text-[var(--text-muted)]"} key={item.key} type="button" onClick={() => setWindowKey(item.key)}>{item.label}</button>)}
            </div>
          ) : null}
          <div className="flex flex-wrap rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)] p-1">
            {metrics.map((item) => <button className={item.key === metricKey ? "rounded-[10px] bg-[var(--surface)] px-3 py-2 text-sm font-extrabold text-[var(--accent-strong)] shadow-[var(--shadow-soft)]" : "rounded-[10px] px-3 py-2 text-sm font-extrabold text-[var(--text-muted)]"} key={item.key} type="button" onClick={() => { setMetricKey(item.key); setActiveIndex(null); }}>{item.label}</button>)}
          </div>
        </div>
      </div>

      {isBackfilled ? <p className="mb-4 rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-muted)]"><strong className="text-[var(--text)]">Backfilled score is not official Reddit account karma.</strong> It is a content-score estimate built from imported snapshots, post dates, comment dates, and later observed deltas. For actual karma/followers, use Total karma, Link karma, Comment karma, or Followers.</p> : null}

      {state === "error" ? <p className="text-[var(--issue)]">{error}</p> : null}
      {state === "loading" ? <p className={mutedClass}>Loading account history…</p> : null}
      {state === "loaded" && !isBackfilled && points.length === 0 ? <p className={mutedClass}>No account metric points yet. Import a dated profile HTML snapshot or run the extension scan.</p> : null}
      {state === "loaded" && isBackfilled && chartData.points.length === 0 ? <p className={mutedClass}>No imported historical score points yet. Import dated Reddit HTML/TXT snapshots from History Import.</p> : null}
      {state === "loaded" && chartData.points.length === 0 && !isBackfilled ? <p className={mutedClass}>No {metric.label.toLowerCase()} points found in this window yet.</p> : null}

      {chartData.points.length > 0 && chartData.scale ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="relative rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 sm:p-4">
            <svg className="h-[340px] w-full touch-none overflow-visible" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`${metric.label} trend`} onPointerMove={handlePointerMove} onPointerLeave={() => setActiveIndex(null)}>
              <defs><linearGradient id="accountMetricArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
              <rect x={plot.left} y={plot.top} width={plot.width} height={plot.height} fill="transparent" />
              {chartData.scale.ticks.map((tick) => { const y = yForValue(tick, chartData.scale as ChartScale); return <g key={tick}><line x1={plot.left} x2={plot.right} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 6" /><text x={plot.left - 12} y={y + 4} textAnchor="end" className="fill-[var(--text-muted)] text-[12px] font-bold">{formatTick(tick)}</text></g>; })}
              <line x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.bottom} stroke="var(--border-strong)" strokeWidth="1.5" />
              <line x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} stroke="var(--border-strong)" strokeWidth="1.5" />
              <text x={plot.left} y={18} className="fill-[var(--text-muted)] text-[12px] font-extrabold uppercase tracking-[0.18em]">{metric.axisLabel}</text>
              {xLabels.map((label) => <g key={`${label.x}-${label.label}`}><line x1={label.x} x2={label.x} y1={plot.bottom} y2={plot.bottom + 6} stroke="var(--border-strong)" strokeWidth="1.5" /><text x={label.x} y={plot.bottom + 28} textAnchor="middle" className="fill-[var(--text-muted)] text-[12px] font-bold">{label.label}</text></g>)}
              {markers.map((event) => <g key={event.id}><line x1={event.x} x2={event.x} y1={plot.top} y2={plot.bottom} stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="3 7" opacity="0.7" /><path d={`M ${event.x} ${plot.top - 10} L ${event.x + 7} ${plot.top - 2} L ${event.x} ${plot.top + 6} L ${event.x - 7} ${plot.top - 2} Z`} fill={event.type === "spike" ? "var(--ok)" : "var(--accent)"}><title>{`${event.label} · ${event.detail}`}</title></path></g>)}
              {area ? <path d={area} fill="url(#accountMetricArea)" /> : null}
              <path d={path} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              {chartData.points.map((point, index) => <circle key={`${point.capturedAt}-${point.value}`} cx={point.x} cy={point.y} r={activeIndex === index ? 6 : 4} fill="var(--surface)" stroke="var(--accent)" strokeWidth={activeIndex === index ? 4 : 3} />)}
              {activePoint ? <g><line x1={activePoint.x} x2={activePoint.x} y1={plot.top} y2={plot.bottom} stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="5 5" /><circle cx={activePoint.x} cy={activePoint.y} r="8" fill="var(--accent)" opacity="0.18" /></g> : null}
            </svg>
            {activePoint ? <div className="pointer-events-none absolute z-10 min-w-[190px] rounded-[16px] border border-[var(--border-strong)] bg-[var(--surface)] p-3 text-sm shadow-[var(--shadow-soft)]" style={{ left: `${Math.min(78, Math.max(8, (activePoint.x / chart.width) * 100))}%`, top: `${Math.min(68, Math.max(10, (activePoint.y / chart.height) * 100))}%` }}><span className="block text-xs font-extrabold tracking-widest text-[var(--text-muted)] uppercase">{formatPointTime(activePoint.capturedAt, windowKey, isBackfilled)}</span><strong className="mt-1 block text-xl text-[var(--text)]">{numberFormat(activePoint.value)}</strong><span className="mt-1 block text-[var(--text-muted)]">{metric.label}</span></div> : null}
          </div>
          <div className="grid gap-3 content-start">
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4"><span className="block text-sm text-[var(--text-muted)]">Total karma</span><strong className="mt-1 block text-3xl font-extrabold text-[var(--text)]">{compactNumber(current?.totalKarma ?? 0)}</strong><small className={karmaDelta >= 0 ? "text-[var(--ok)]" : "text-[var(--issue)]"}>{formatDelta(karmaDelta)} in observed window</small></div>
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4"><span className="block text-sm text-[var(--text-muted)]">Followers</span><strong className="mt-1 block text-3xl font-extrabold text-[var(--text)]">{current?.followerCount === null || current?.followerCount === undefined ? "N/A" : compactNumber(current.followerCount)}</strong>{followerDelta === null ? <small className="text-[var(--text-muted)]">Import HTML or run scan to populate followers.</small> : <small className={followerDelta >= 0 ? "text-[var(--ok)]" : "text-[var(--issue)]"}>{formatDelta(followerDelta)} in observed window</small>}</div>
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4"><span className="block text-sm text-[var(--text-muted)]">Backfilled score</span><strong className="mt-1 block text-3xl font-extrabold text-[var(--text)]">{importedLatest === null ? "N/A" : compactNumber(importedLatest)}</strong><small className={importedDelta === null || importedDelta >= 0 ? "text-[var(--text-muted)]" : "text-[var(--issue)]"}>{importedDelta === null ? "Import snapshots to populate." : `${formatDelta(importedDelta)} across imported history`}</small></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
