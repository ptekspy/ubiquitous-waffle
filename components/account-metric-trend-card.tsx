"use client";

import { useEffect, useMemo, useState } from "react";

import type { AccountMetricHistory, AccountMetricPoint } from "@/lib/types";
import { cardClass, mutedClass } from "@/lib/ui/styles";
import { compactNumber } from "@/utils/compact-number";

type WindowKey = AccountMetricHistory["window"];

type LoadState = "idle" | "loading" | "loaded" | "error";

const windows: Array<{ key: WindowKey; label: string }> = [
  { key: "hour", label: "Hour" },
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
];

async function fetchHistory(windowKey: WindowKey): Promise<AccountMetricHistory> {
  const response = await fetch(`/api/metrics/account?window=${windowKey}&ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load account metric history.");
  return (await response.json()) as AccountMetricHistory;
}

function linePoints(points: AccountMetricPoint[]): string {
  if (points.length === 0) return "";

  const width = 560;
  const height = 150;
  const values = points.map((point) => point.totalKarma);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, 1);

  return points
    .map((point, index) => {
      const x = points.length === 1 ? width : (index / (points.length - 1)) * width;
      const y = height - ((point.totalKarma - min) / spread) * height;
      return `${Math.round(x)},${Math.round(y)}`;
    })
    .join(" ");
}

function latest(points: AccountMetricPoint[]): AccountMetricPoint | null {
  return points.at(-1) ?? null;
}

function first(points: AccountMetricPoint[]): AccountMetricPoint | null {
  return points[0] ?? null;
}

export function AccountMetricTrendCard() {
  const [windowKey, setWindowKey] = useState<WindowKey>("day");
  const [state, setState] = useState<LoadState>("idle");
  const [history, setHistory] = useState<AccountMetricHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState("loading");
      setError(null);

      try {
        const result = await fetchHistory(windowKey);
        if (!cancelled) {
          setHistory(result);
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

    return () => {
      cancelled = true;
    };
  }, [windowKey]);

  const points = history?.points ?? [];
  const current = latest(points);
  const start = first(points);
  const karmaDelta = current && start ? current.totalKarma - start.totalKarma : 0;
  const followerDelta = current?.followerCount !== null && current?.followerCount !== undefined && start?.followerCount !== null && start?.followerCount !== undefined ? current.followerCount - start.followerCount : null;
  const svgPoints = useMemo(() => linePoints(points), [points]);

  return (
    <section className={`${cardClass} overflow-hidden p-5`}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="ui-eyebrow">Account trend</span>
          <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Karma and follower history</h2>
          <p className={mutedClass}>Scheduled profile scans create the time-series points for this chart.</p>
        </div>
        <div className="flex rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)] p-1">
          {windows.map((item) => (
            <button
              className={item.key === windowKey ? "rounded-[10px] bg-[var(--surface)] px-3 py-2 text-sm font-extrabold text-[var(--accent-strong)] shadow-[var(--shadow-soft)]" : "rounded-[10px] px-3 py-2 text-sm font-extrabold text-[var(--text-muted)]"}
              key={item.key}
              type="button"
              onClick={() => setWindowKey(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {state === "error" ? <p className="text-[var(--issue)]">{error}</p> : null}
      {state === "loading" ? <p className={mutedClass}>Loading account history…</p> : null}

      {state === "loaded" && points.length === 0 ? (
        <p className={mutedClass}>No scheduled profile metric points yet. Start the scheduler worker and the chart will fill in over time.</p>
      ) : null}

      {points.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <svg className="h-[190px] w-full overflow-visible" viewBox="0 0 560 170" role="img" aria-label="Total karma trend">
              <line x1="0" y1="150" x2="560" y2="150" stroke="var(--border)" strokeWidth="2" />
              <polyline points={svgPoints} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="grid gap-3">
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <span className="block text-sm text-[var(--text-muted)]">Total karma</span>
              <strong className="mt-1 block text-3xl font-extrabold text-[var(--text)]">{compactNumber(current?.totalKarma ?? 0)}</strong>
              <small className={karmaDelta >= 0 ? "text-[var(--ok)]" : "text-[var(--issue)]"}>{karmaDelta >= 0 ? "+" : ""}{compactNumber(karmaDelta)} in window</small>
            </div>
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <span className="block text-sm text-[var(--text-muted)]">Followers</span>
              <strong className="mt-1 block text-3xl font-extrabold text-[var(--text)]">{current?.followerCount === null || current?.followerCount === undefined ? "N/A" : compactNumber(current.followerCount)}</strong>
              {followerDelta === null ? <small className="text-[var(--text-muted)]">Only available when Reddit exposes it.</small> : <small className={followerDelta >= 0 ? "text-[var(--ok)]" : "text-[var(--issue)]"}>{followerDelta >= 0 ? "+" : ""}{compactNumber(followerDelta)} in window</small>}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
