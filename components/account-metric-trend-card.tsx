"use client";

import { useEffect, useMemo, useState, type PointerEvent } from "react";

import type { AccountMetricEvent, AccountMetricHistory, AccountMetricPoint, HistoricalPerformancePoint, HistoricalPerformanceResponse } from "@/lib/types";
import { cardClass, mutedClass } from "@/lib/ui/styles";
import { compactNumber } from "@/utils/compact-number";
import { numberFormat } from "@/utils/number-format";

type WindowKey = AccountMetricHistory["window"];
type LoadState = "idle" | "loading" | "loaded" | "error";
type MetricKey = "totalKarma" | "linkKarma" | "commentKarma" | "followerCount" | "backfilledScore" | "backfilledDailyScore" | "backfilledViews" | "backfilledDailyViews";
type SeriesSource = "observed" | "backfilled";
type MetricConfig = { key: MetricKey; label: string; axisLabel: string; source: SeriesSource; color: string; dashed?: boolean };
type ChartScale = { min: number; max: number; ticks: number[] };
type SeriesPoint = { capturedAt: string; time: number; value: number; x: number; y: number; originalIndex: number };
type ChartSeries = MetricConfig & { points: SeriesPoint[]; scale: ChartScale };
type ChartEvent = AccountMetricEvent & { x: number; time: number; y: number; value: number };
type RangeMode = "rolling" | "today" | "all";
type RangeUnit = "hours" | "days";
type TimeRange = { from: number | null; to: number | null; window: WindowKey; label: string; importedFrom: string | null; importedTo: string | null };

const quickRanges: Array<{ mode: RangeMode; amount?: number; unit?: RangeUnit; label: string }> = [
  { mode: "rolling", amount: 6, unit: "hours", label: "6h" },
  { mode: "rolling", amount: 24, unit: "hours", label: "24h" },
  { mode: "today", label: "Today" },
  { mode: "rolling", amount: 7, unit: "days", label: "7d" },
  { mode: "rolling", amount: 30, unit: "days", label: "30d" },
  { mode: "all", label: "All" },
];

const metrics: MetricConfig[] = [
  { key: "totalKarma", label: "Total karma", axisLabel: "Karma", source: "observed", color: "#e11d48" },
  { key: "linkKarma", label: "Link karma", axisLabel: "Link karma", source: "observed", color: "#2563eb" },
  { key: "commentKarma", label: "Comment karma", axisLabel: "Comment karma", source: "observed", color: "#0891b2" },
  { key: "followerCount", label: "Followers", axisLabel: "Followers", source: "observed", color: "#16a34a" },
  { key: "backfilledScore", label: "Backfilled score", axisLabel: "Estimated score", source: "backfilled", color: "#9333ea" },
  { key: "backfilledDailyScore", label: "Daily score", axisLabel: "Daily score", source: "backfilled", color: "#f59e0b", dashed: true },
  { key: "backfilledViews", label: "Views", axisLabel: "Visible views", source: "backfilled", color: "#db2777" },
  { key: "backfilledDailyViews", label: "Daily views", axisLabel: "Daily views", source: "backfilled", color: "#0d9488", dashed: true },
];

const defaultActiveMetrics = metrics.map((metric) => metric.key);
const observedMetricKeys = new Set<MetricKey>(["totalKarma", "linkKarma", "commentKarma", "followerCount"]);
const chart = { width: 880, height: 370, top: 34, right: 34, bottom: 76, left: 82 };
const postSeriesColor = "#7c2d12";
const plot = {
  left: chart.left,
  top: chart.top,
  width: chart.width - chart.left - chart.right,
  height: chart.height - chart.top - chart.bottom,
  get right() { return this.left + this.width; },
  get bottom() { return this.top + this.height; },
};

async function fetchHistory(range: TimeRange): Promise<AccountMetricHistory> {
  const params = new URLSearchParams({ window: range.window, ts: String(Date.now()) });
  if (range.from !== null) params.set("from", new Date(range.from).toISOString());
  if (range.to !== null) params.set("to", new Date(range.to).toISOString());
  const response = await fetch(`/api/metrics/account?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load account metric history.");
  return (await response.json()) as AccountMetricHistory;
}

async function fetchBackfilledHistory(range: TimeRange): Promise<HistoricalPerformanceResponse> {
  const params = new URLSearchParams({ preset: range.importedFrom ? "custom" : "all", ts: String(Date.now()) });
  if (range.importedFrom) params.set("from", range.importedFrom);
  if (range.importedTo) params.set("to", range.importedTo);
  const response = await fetch(`/api/history/performance?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load imported historical score history.");
  return (await response.json()) as HistoricalPerformanceResponse;
}

function metricValue(point: AccountMetricPoint, metricKey: MetricKey): number | null {
  if (!observedMetricKeys.has(metricKey)) return null;
  const value = point[metricKey as keyof Pick<AccountMetricPoint, "totalKarma" | "linkKarma" | "commentKarma" | "followerCount">];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function backfilledValue(point: HistoricalPerformancePoint, metricKey: MetricKey): number | null {
  const value = metricKey === "backfilledScore"
    ? point.cumulativeScore
    : metricKey === "backfilledDailyScore"
      ? point.scoreDelta
      : metricKey === "backfilledViews"
        ? point.cumulativeViews
        : metricKey === "backfilledDailyViews"
          ? point.viewsDelta
          : null;
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

function dayTime(value: string): number | null {
  return timeValue(`${value}T00:00:00.000Z`);
}

function importedDateRange(from: number | null, to: number | null): Pick<TimeRange, "importedFrom" | "importedTo"> {
  if (from === null) return { importedFrom: null, importedTo: null };
  return { importedFrom: new Date(from).toISOString(), importedTo: new Date(to ?? Date.now()).toISOString() };
}

function resolveTimeRange(mode: RangeMode, amount: number, unit: RangeUnit): TimeRange {
  const now = Date.now();
  if (mode === "all") return { from: null, to: null, window: "all", label: "All history", importedFrom: null, importedTo: null };
  if (mode === "today") {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return { from: midnight.getTime(), to: now, window: "custom", label: "Today from midnight", ...importedDateRange(midnight.getTime(), now) };
  }

  const safeAmount = Math.max(1, Math.min(365, Math.round(amount)));
  const duration = safeAmount * (unit === "hours" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000);
  const from = now - duration;
  const label = `Past ${safeAmount} ${unit}`;
  return { from, to: now, window: safeAmount === 1 && unit === "hours" ? "hour" : "custom", label, ...importedDateRange(from, now) };
}

function xForTime(time: number, minTime: number, maxTime: number): number {
  const spread = Math.max(maxTime - minTime, 1);
  return plot.left + ((time - minTime) / spread) * plot.width;
}

function yForValue(value: number, scale: ChartScale): number {
  return plot.bottom - ((value - scale.min) / Math.max(scale.max - scale.min, 1)) * plot.height;
}

function linePath(points: SeriesPoint[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function formatTick(value: number): string {
  return Math.abs(value) >= 1_000 ? compactNumber(value) : numberFormat(value);
}

function formatDelta(value: number): string {
  return `${value > 0 ? "+" : ""}${compactNumber(value)}`;
}

function formatPointTime(value: string, range: TimeRange, imported = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const spread = range.from === null || range.to === null ? Number.POSITIVE_INFINITY : range.to - range.from;
  if (imported || range.window === "all" || spread > 31 * 24 * 60 * 60 * 1000) return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "2-digit" }).format(date);
  if (spread > 36 * 60 * 60 * 1000) return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function xAxisLabels(minTime: number, maxTime: number, range: TimeRange): Array<{ x: number; label: string }> {
  const spread = Math.max(maxTime - minTime, 1);
  const fractions = spread > 7 * 24 * 60 * 60 * 1000 ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1];
  return fractions.map((fraction) => {
    const time = minTime + fraction * spread;
    return { x: xForTime(time, minTime, maxTime), label: formatPointTime(new Date(time).toISOString(), range, range.window === "all") };
  });
}

function nearestPoint(series: ChartSeries, time: number): SeriesPoint | null {
  if (series.points.length === 0) return null;
  return series.points.reduce((best, point) => Math.abs(point.time - time) < Math.abs(best.time - time) ? point : best, series.points[0]);
}

function eventMarkers(events: AccountMetricEvent[], minTime: number, maxTime: number, scale: ChartScale): ChartEvent[] {
  return events
    .map((event) => {
      const eventTime = timeValue(event.capturedAt);
      const value = typeof event.value === "number" && Number.isFinite(event.value) ? event.value : 0;
      return eventTime === null ? null : { ...event, time: eventTime, value, x: xForTime(eventTime, minTime, maxTime), y: yForValue(value, scale) };
    })
    .filter((event): event is ChartEvent => event !== null && Number.isFinite(event.x) && event.x >= plot.left && event.x <= plot.right);
}

function latest(points: AccountMetricPoint[]): AccountMetricPoint | null { return points.at(-1) ?? null; }
function first(points: AccountMetricPoint[]): AccountMetricPoint | null { return points[0] ?? null; }
function deltaLabel(value: number | null): string {
  return value === null ? "No window delta yet." : `${formatDelta(value)} in observed window`;
}

function backfilledDeltaLabel(value: number | null): string {
  return value === null ? "Import snapshots to populate." : `${formatDelta(value)} in selected range`;
}

export function AccountMetricTrendCard() {
  const [rangeMode, setRangeMode] = useState<RangeMode>("all");
  const [rangeAmount, setRangeAmount] = useState(24);
  const [rangeUnit, setRangeUnit] = useState<RangeUnit>("hours");
  const [activeMetrics, setActiveMetrics] = useState<MetricKey[]>(defaultActiveMetrics);
  const [showPosts, setShowPosts] = useState(true);
  const [hoveredLegendKey, setHoveredLegendKey] = useState<MetricKey | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [history, setHistory] = useState<AccountMetricHistory | null>(null);
  const [backfilledHistory, setBackfilledHistory] = useState<HistoricalPerformanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTime, setActiveTime] = useState<number | null>(null);
  const [activePost, setActivePost] = useState<ChartEvent | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const selectedRange = useMemo(() => resolveTimeRange(rangeMode, rangeAmount, rangeUnit), [rangeAmount, rangeMode, rangeUnit]);

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
      setActiveTime(null);
      setActivePost(null);
      try {
        const [observed, imported] = await Promise.all([
          fetchHistory(selectedRange),
          fetchBackfilledHistory(selectedRange).catch(() => null),
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
  }, [refreshKey, selectedRange]);

  const points = history?.points ?? [];
  const current = latest(points);
  const start = points.length >= 2 ? first(points) : null;
  const karmaDelta = current && start ? current.totalKarma - start.totalKarma : null;
  const followerPoints = points.filter((point) => point.followerCount !== null && point.followerCount !== undefined);
  const currentFollowerPoint = followerPoints.at(-1) ?? null;
  const startFollowerPoint = followerPoints.length >= 2 ? followerPoints[0] : null;
  const followerDelta = currentFollowerPoint && startFollowerPoint ? (currentFollowerPoint.followerCount ?? 0) - (startFollowerPoint.followerCount ?? 0) : null;

  const chartData = useMemo(() => {
    const rowsByMetric = new Map<MetricKey, Array<{ capturedAt: string; time: number; value: number; originalIndex: number }>>();
    const addRow = (metricKey: MetricKey, row: { capturedAt: string; time: number; value: number; originalIndex: number }) => {
      if (selectedRange.from !== null && row.time < selectedRange.from) return;
      if (selectedRange.to !== null && row.time > selectedRange.to) return;
      rowsByMetric.set(metricKey, [...(rowsByMetric.get(metricKey) ?? []), row]);
    };

    for (const metric of metrics) rowsByMetric.set(metric.key, []);

    points.forEach((point, index) => {
      const time = timeValue(point.capturedAt);
      if (time === null) return;
      for (const metric of metrics.filter((item) => item.source === "observed")) {
        const value = metricValue(point, metric.key);
        if (value !== null) addRow(metric.key, { capturedAt: point.capturedAt, time, value, originalIndex: index });
      }
    });

    (backfilledHistory?.points ?? []).forEach((point, index) => {
      const time = dayTime(point.date);
      if (time === null) return;
      for (const metric of metrics.filter((item) => item.source === "backfilled")) {
        const value = backfilledValue(point, metric.key);
        if (value !== null) addRow(metric.key, { capturedAt: `${point.date}T00:00:00.000Z`, time, value, originalIndex: index });
      }
    });

    const activeSet = new Set(activeMetrics);
    const rawSeries = metrics
      .filter((metric) => activeSet.has(metric.key))
      .map((metric) => ({ metric, rows: (rowsByMetric.get(metric.key) ?? []).sort((a, b) => a.time - b.time) }))
      .filter((series) => series.rows.length > 0);

    const postEvents = (history?.events ?? []).filter((event) => {
      if (event.type !== "post") return false;
      const time = timeValue(event.capturedAt);
      if (time === null) return false;
      if (selectedRange.from !== null && time < selectedRange.from) return false;
      if (selectedRange.to !== null && time > selectedRange.to) return false;
      return true;
    });
    const eventTimes = showPosts ? postEvents.map((event) => timeValue(event.capturedAt)).filter((time): time is number => time !== null) : [];
    const allTimes = [...rawSeries.flatMap((series) => series.rows.map((row) => row.time)), ...eventTimes];
    if (allTimes.length === 0) return { series: [] as ChartSeries[], events: [] as ChartEvent[], minTime: 0, maxTime: 0, axisSeries: null as ChartSeries | null, axisScale: null as ChartScale | null, axisLabel: "", postScale: null as ChartScale | null };

    const rawMinTime = Math.min(...allTimes);
    const rawMaxTime = Math.max(...allTimes);
    const minTime = rawMinTime === rawMaxTime ? rawMinTime - 30 * 60 * 1000 : rawMinTime;
    const maxTime = rawMinTime === rawMaxTime ? rawMaxTime + 30 * 60 * 1000 : rawMaxTime;
    const postValues = postEvents.map((event) => typeof event.value === "number" && Number.isFinite(event.value) ? event.value : 0);
    const postScale = postValues.length > 0 ? chartScale(postValues) : null;
    const series = rawSeries.map(({ metric, rows }) => {
      const scale = chartScale(rows.map((row) => row.value));
      return {
        ...metric,
        scale,
        points: rows.map((row) => ({ ...row, x: xForTime(row.time, minTime, maxTime), y: yForValue(row.value, scale) })),
      };
    });
    const axisSeries = series.find((item) => item.key === hoveredLegendKey) ?? series[0] ?? null;
    const axisScale = axisSeries?.scale ?? postScale;
    const axisLabel = axisSeries?.axisLabel ?? "Post score";
    return { series, events: showPosts && postScale ? eventMarkers(postEvents, minTime, maxTime, postScale) : [], minTime, maxTime, axisSeries, axisScale, axisLabel, postScale };
  }, [activeMetrics, backfilledHistory?.points, history?.events, hoveredLegendKey, points, selectedRange, showPosts]);

  const hasChartData = chartData.series.length > 0 || chartData.events.length > 0;
  const xLabels = useMemo(() => hasChartData ? xAxisLabels(chartData.minTime, chartData.maxTime, selectedRange) : [], [chartData.maxTime, chartData.minTime, hasChartData, selectedRange]);
  const activeSeriesValues = useMemo(() => {
    if (activeTime === null) return [];
    return chartData.series
      .map((series) => ({ series, point: nearestPoint(series, activeTime) }))
      .filter((row): row is { series: ChartSeries; point: SeriesPoint } => row.point !== null)
      .sort((a, b) => metrics.findIndex((metric) => metric.key === a.series.key) - metrics.findIndex((metric) => metric.key === b.series.key));
  }, [activeTime, chartData.series]);
  const activeX = activeTime === null || !hasChartData ? null : xForTime(activeTime, chartData.minTime, chartData.maxTime);
  const activeLabel = activeTime === null ? "" : formatPointTime(new Date(activeTime).toISOString(), selectedRange, selectedRange.window === "all");
  const importedLatest = backfilledHistory?.points.at(-1)?.cumulativeScore ?? null;
  const importedDelta = backfilledHistory?.summary.scoreDelta ?? null;
  const importedViewPoints = (backfilledHistory?.points ?? []).filter((point) => point.cumulativeViews !== null);
  const importedLatestViews = importedViewPoints.at(-1)?.cumulativeViews ?? null;
  const summaryViewsDelta = backfilledHistory?.summary.viewsDelta ?? null;
  const importedFirstViews = importedViewPoints[0]?.cumulativeViews ?? null;
  const importedViewsDelta = summaryViewsDelta ?? (importedLatestViews !== null && importedFirstViews !== null ? importedLatestViews - importedFirstViews : null);
  const viewsDisplayValue = importedLatestViews ?? importedViewsDelta;

  function toggleMetric(metricKey: MetricKey) {
    setActiveMetrics((currentMetrics) => currentMetrics.includes(metricKey) ? currentMetrics.filter((key) => key !== metricKey) : [...currentMetrics, metricKey]);
    setActiveTime(null);
    setActivePost(null);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * chart.width;
    const y = ((event.clientY - rect.top) / rect.height) * chart.height;
    const nearestPost = chartData.events.length > 0
      ? chartData.events.reduce((best, post) => {
          const distance = Math.hypot(post.x - x, post.y - y);
          return !best || distance < best.distance ? { post, distance } : best;
        }, null as { post: ChartEvent; distance: number } | null)
      : null;
    if (nearestPost && nearestPost.distance <= 18) {
      setActivePost(nearestPost.post);
      setActiveTime(nearestPost.post.time);
      return;
    }

    if (chartData.series.length === 0) {
      setActivePost(null);
      return;
    }

    const time = chartData.minTime + ((x - plot.left) / Math.max(plot.width, 1)) * Math.max(chartData.maxTime - chartData.minTime, 1);
    const nearest = chartData.series.flatMap((series) => series.points).reduce((best, point) => Math.abs(point.time - time) < Math.abs(best.time - time) ? point : best, chartData.series[0].points[0]);
    setActiveTime(nearest.time);
    setActivePost(null);
  }

  function applyQuickRange(item: (typeof quickRanges)[number]) {
    setRangeMode(item.mode);
    if (item.amount) setRangeAmount(item.amount);
    if (item.unit) setRangeUnit(item.unit);
    setActiveTime(null);
    setActivePost(null);
  }

  return (
    <section className={`${cardClass} overflow-hidden p-5`}>
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <span className="ui-eyebrow">Account trend</span>
          <h2 className="mt-2 mb-1 text-2xl font-extrabold text-[var(--text)]">Karma, followers, views and posting cadence</h2>
          <p className={mutedClass}>Toggle series on the legend to compare metrics on one timeline. Current range: {selectedRange.label}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)] p-1">
            {quickRanges.map((item) => {
              const active = item.mode === rangeMode && (item.mode !== "rolling" || (item.amount === rangeAmount && item.unit === rangeUnit));
              return <button className={active ? "rounded-[10px] bg-[var(--surface)] px-3 py-2 text-sm font-extrabold text-[var(--accent-strong)] shadow-[var(--shadow-soft)]" : "rounded-[10px] px-3 py-2 text-sm font-extrabold text-[var(--text-muted)]"} key={`${item.mode}-${item.amount ?? "all"}-${item.unit ?? "none"}`} type="button" onClick={() => applyQuickRange(item)}>{item.label}</button>;
            })}
          </div>
          <label className="flex items-center gap-2 rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-extrabold text-[var(--text-muted)]">
            Past
            <input
              className="w-16 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm font-extrabold text-[var(--text)]"
              min="1"
              max={rangeUnit === "hours" ? 8760 : 365}
              type="number"
              value={rangeAmount}
              onChange={(event) => { setRangeMode("rolling"); setRangeAmount(Number(event.target.value) || 1); setActiveTime(null); setActivePost(null); }}
            />
          </label>
          <select
            className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-extrabold text-[var(--text-muted)]"
            value={rangeUnit}
            onChange={(event) => { setRangeMode("rolling"); setRangeUnit(event.target.value as RangeUnit); setActiveTime(null); setActivePost(null); }}
          >
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {metrics.map((metric) => {
          const active = activeMetrics.includes(metric.key);
          return (
            <button
              aria-pressed={active}
              className={active ? "flex items-center gap-2 rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm font-extrabold text-[var(--text)] shadow-[var(--shadow-soft)]" : "flex items-center gap-2 rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-extrabold text-[var(--text-muted)]"}
              key={metric.key}
              type="button"
              onClick={() => toggleMetric(metric.key)}
              onPointerEnter={() => setHoveredLegendKey(metric.key)}
              onPointerLeave={() => setHoveredLegendKey(null)}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: metric.color }} />
              {metric.label}
            </button>
          );
        })}
        <button
          aria-pressed={showPosts}
          className={showPosts ? "flex items-center gap-2 rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm font-extrabold text-[var(--text)] shadow-[var(--shadow-soft)]" : "flex items-center gap-2 rounded-[12px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-extrabold text-[var(--text-muted)]"}
          type="button"
          onClick={() => { setShowPosts((value) => !value); setActivePost(null); }}
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: postSeriesColor }} />
          Posts
        </button>
      </div>

      <p className="mb-4 rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-muted)]"><strong className="text-[var(--text)]">Mixed-scale chart.</strong> Each active line is scaled independently so shape and timing are comparable. Hover the legend to inspect that series y-axis, and hover the chart to see exact values.</p>

      {state === "error" ? <p className="text-[var(--issue)]">{error}</p> : null}
      {state === "loading" ? <p className={mutedClass}>Loading account history...</p> : null}
      {state === "loaded" && points.length === 0 && (backfilledHistory?.points ?? []).length === 0 ? <p className={mutedClass}>No account metric points yet. Import dated profile HTML snapshots or run the extension scan.</p> : null}
      {state === "loaded" && !hasChartData ? <p className={mutedClass}>No active series have data in this window.</p> : null}

      {hasChartData && chartData.axisScale ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="relative rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 sm:p-4">
            <svg className="h-[370px] w-full touch-none overflow-visible" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Account multi-series trend" onPointerMove={handlePointerMove} onPointerLeave={() => { setActiveTime(null); setActivePost(null); }}>
              <rect x={plot.left} y={plot.top} width={plot.width} height={plot.height} fill="transparent" />
              {chartData.axisScale.ticks.map((tick) => {
                const y = yForValue(tick, chartData.axisScale as ChartScale);
                return <g key={`${chartData.axisLabel}-${tick}`}><line x1={plot.left} x2={plot.right} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 6" /><text x={plot.left - 12} y={y + 4} textAnchor="end" className="fill-[var(--text-muted)] text-[12px] font-bold">{formatTick(tick)}</text></g>;
              })}
              <line x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.bottom} stroke="var(--border-strong)" strokeWidth="1.5" />
              <line x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} stroke="var(--border-strong)" strokeWidth="1.5" />
              <text x={plot.left} y={18} className="fill-[var(--text-muted)] text-[12px] font-extrabold uppercase">{chartData.axisLabel}</text>
              {xLabels.map((label) => <g key={`${label.x}-${label.label}`}><line x1={label.x} x2={label.x} y1={plot.bottom} y2={plot.bottom + 6} stroke="var(--border-strong)" strokeWidth="1.5" /><text x={label.x} y={plot.bottom + 28} textAnchor="middle" className="fill-[var(--text-muted)] text-[12px] font-bold">{label.label}</text></g>)}
              {chartData.series.map((series) => <path key={series.key} d={linePath(series.points)} fill="none" stroke={series.color} strokeWidth={hoveredLegendKey === series.key ? 4.5 : 3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={series.dashed ? "8 8" : undefined} opacity={hoveredLegendKey && hoveredLegendKey !== series.key ? 0.32 : 0.92} />)}
              {chartData.series.map((series) => series.points.filter((_, index) => index === 0 || index === series.points.length - 1 || (activeTime !== null && nearestPoint(series, activeTime)?.originalIndex === series.points[index].originalIndex)).map((point) => <circle key={`${series.key}-${point.capturedAt}-${point.value}`} cx={point.x} cy={point.y} r={activeTime !== null && Math.abs(point.time - activeTime) < 1000 ? 5 : 3} fill="var(--surface)" stroke={series.color} strokeWidth="2.5" />))}
              {chartData.events.map((event) => <circle data-post-dot="true" key={event.id} cx={event.x} cy={event.y} r={activePost?.id === event.id ? 7 : 5} fill="var(--surface)" stroke={postSeriesColor} strokeWidth="3" onPointerEnter={() => { setActivePost(event); setActiveTime(event.time); }} onPointerLeave={() => setActivePost(null)} />)}
              {activeX !== null ? <line x1={activeX} x2={activeX} y1={plot.top} y2={plot.bottom} stroke="var(--text)" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.55" /> : null}
            </svg>
            {activeSeriesValues.length > 0 && activeX !== null ? <div className="pointer-events-none absolute z-10 min-w-[230px] rounded-[16px] border border-[var(--border-strong)] bg-[var(--surface)] p-3 text-sm shadow-[var(--shadow-soft)]" style={{ left: `${Math.min(74, Math.max(8, (activeX / chart.width) * 100))}%`, top: "14%" }}><span className="block text-xs font-extrabold tracking-widest text-[var(--text-muted)] uppercase">{activeLabel}</span><div className="mt-2 grid gap-1.5">{activeSeriesValues.map(({ series, point }) => <div className="flex items-center justify-between gap-4" key={series.key}><span className="flex items-center gap-2 text-[var(--text-muted)]"><span className="h-2 w-2 rounded-full" style={{ background: series.color }} />{series.label}</span><strong className="text-[var(--text)]">{numberFormat(point.value)}</strong></div>)}</div></div> : null}
            {activePost ? <div className="pointer-events-none absolute z-20 w-[min(320px,calc(100%-24px))] rounded-[16px] border border-[var(--border-strong)] bg-[var(--surface)] p-3 text-sm shadow-[var(--shadow-soft)]" style={{ left: `${Math.min(62, Math.max(8, (activePost.x / chart.width) * 100))}%`, top: `${Math.min(62, Math.max(8, (activePost.y / chart.height) * 100))}%` }}><span className="block text-xs font-extrabold tracking-widest text-[var(--text-muted)] uppercase">{formatPointTime(activePost.capturedAt, selectedRange)}</span><strong className="mt-1 block text-[var(--text)]">{activePost.detail}</strong><div className="mt-2 grid gap-1 text-[var(--text-muted)]"><span>r/{activePost.subreddit ?? "unknown"}</span><span>{numberFormat(activePost.value)} score · {numberFormat(activePost.comments ?? 0)} comments{activePost.views !== null && activePost.views !== undefined ? ` · ${compactNumber(activePost.views)} views` : ""}</span></div>{activePost.permalink ? <span className="mt-2 block truncate text-xs font-bold text-[var(--accent-strong)]">{activePost.permalink.replace(/^https?:\/\/(www\.)?reddit\.com/i, "")}</span> : null}</div> : null}
          </div>
          <div className="grid gap-3 content-start">
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4"><span className="block text-sm text-[var(--text-muted)]">Total karma</span><strong className="mt-1 block text-3xl font-extrabold text-[var(--text)]">{compactNumber(current?.totalKarma ?? 0)}</strong><small className={karmaDelta === null ? "text-[var(--text-muted)]" : karmaDelta >= 0 ? "text-[var(--ok)]" : "text-[var(--issue)]"}>{deltaLabel(karmaDelta)}</small></div>
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4"><span className="block text-sm text-[var(--text-muted)]">Followers</span><strong className="mt-1 block text-3xl font-extrabold text-[var(--text)]">{currentFollowerPoint?.followerCount === null || currentFollowerPoint?.followerCount === undefined ? "N/A" : compactNumber(currentFollowerPoint.followerCount)}</strong>{followerDelta === null ? <small className="text-[var(--text-muted)]">Import HTML or run scan to populate followers.</small> : <small className={followerDelta >= 0 ? "text-[var(--ok)]" : "text-[var(--issue)]"}>{deltaLabel(followerDelta)}</small>}</div>
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4"><span className="block text-sm text-[var(--text-muted)]">Backfilled score</span><strong className="mt-1 block text-3xl font-extrabold text-[var(--text)]">{importedLatest === null ? "N/A" : compactNumber(importedLatest)}</strong><small className={importedDelta === null || importedDelta >= 0 ? "text-[var(--text-muted)]" : "text-[var(--issue)]"}>{backfilledDeltaLabel(importedDelta)}</small></div>
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4"><span className="block text-sm text-[var(--text-muted)]">Views</span><strong className="mt-1 block text-3xl font-extrabold text-[var(--text)]">{viewsDisplayValue === null ? "N/A" : compactNumber(viewsDisplayValue)}</strong><small className={importedViewsDelta === null || importedViewsDelta >= 0 ? "text-[var(--text-muted)]" : "text-[var(--issue)]"}>{importedViewsDelta === null ? "Run deep dives or reparse imports." : backfilledDeltaLabel(importedViewsDelta)}</small></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
