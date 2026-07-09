"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ErrorCard } from "@/components/error-card";
import { useDashboardRuntime } from "@/components/dashboard-runtime-provider";
import { fetchIdleCrawlerSummary, type IdleCrawlerSummary } from "@/lib/api/client";
import { cardClass, mutedClass, primaryButtonClass } from "@/lib/ui/styles";
import { compactNumber } from "@/utils/compact-number";
import { numberFormat } from "@/utils/number-format";

type LoadState = "idle" | "loading" | "loaded" | "error";

type SubredditRow = {
  name: string;
  targetCount: number;
  dueCount: number;
  feeds: string[];
  lastRun: string | null;
  nextDue: string | null;
  posts: number;
  score: number;
  comments: number;
};

function dateTime(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function redditSubredditUrl(subreddit: string): string {
  return `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/`;
}

function maxDate(current: string | null, candidate: string | null): string | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
}

function minDate(current: string | null, candidate: string | null): string | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() < new Date(current).getTime() ? candidate : current;
}

function buildSubredditRows(summary: IdleCrawlerSummary | null): SubredditRow[] {
  if (!summary) return [];

  const now = Date.now();
  const rows = new Map<string, SubredditRow>();

  function ensure(subreddit: string): SubredditRow {
    const key = subreddit.toLowerCase();
    const existing = rows.get(key);
    if (existing) return existing;
    const row: SubredditRow = { name: key, targetCount: 0, dueCount: 0, feeds: [], lastRun: null, nextDue: null, posts: 0, score: 0, comments: 0 };
    rows.set(key, row);
    return row;
  }

  for (const target of summary.targets) {
    if (target.kind !== "SUBREDDIT_FEED" || !target.subreddit) continue;
    const row = ensure(target.subreddit);
    row.targetCount += 1;
    if (!row.feeds.includes(target.feed)) row.feeds.push(target.feed);
    row.lastRun = maxDate(row.lastRun, target.lastCompletedAt);
    row.nextDue = minDate(row.nextDue, target.nextDueAt);
    if (target.enabled && target.nextDueAt && new Date(target.nextDueAt).getTime() <= now) row.dueCount += 1;
  }

  for (const post of summary.posts) {
    const row = ensure(post.subreddit);
    row.posts += 1;
    row.score += post.score;
    row.comments += post.numComments;
  }

  return [...rows.values()].sort((a, b) => b.posts - a.posts || b.targetCount - a.targetCount || a.name.localeCompare(b.name));
}

export function SubredditsPage() {
  const runtime = useDashboardRuntime();
  const [state, setState] = useState<LoadState>("idle");
  const [summary, setSummary] = useState<IdleCrawlerSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    const result = await fetchIdleCrawlerSummary();
    if (!result.ok) {
      setState("error");
      setError(result.error);
      return;
    }
    setSummary(result.data);
    setState("loaded");
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("paidpolitely-idle-crawler-refresh", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener("paidpolitely-idle-crawler-refresh", refresh);
      window.clearInterval(timer);
    };
  }, [load]);

  const subredditRows = useMemo(() => buildSubredditRows(summary), [summary]);
  const dueSubreddits = subredditRows.filter((row) => row.dueCount > 0).length;
  const capturedScore = subredditRows.reduce((total, row) => total + row.score, 0);

  return (
    <>
      {runtime.error ? <ErrorCard message={runtime.error} /> : null}
      {error ? <ErrorCard message={error} /> : null}

      <section className={`${cardClass} mb-4 p-5`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="ui-eyebrow">Subreddit coverage</span>
            <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Subreddits</h2>
            <p className={mutedClass}>View the active subreddit feeds the idle crawler is rotating through, their due state, and the recent posts discovered from them.</p>
          </div>
          <button className={primaryButtonClass} type="button" onClick={() => void load()} disabled={state === "loading"}>
            {state === "loading" ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <span className="block text-sm text-[var(--text-muted)]">Subreddits</span>
            <strong className="text-2xl font-black text-[var(--text)]">{numberFormat(subredditRows.length)}</strong>
          </article>
          <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <span className="block text-sm text-[var(--text-muted)]">Due now</span>
            <strong className="text-2xl font-black text-[var(--text)]">{numberFormat(dueSubreddits)}</strong>
          </article>
          <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <span className="block text-sm text-[var(--text-muted)]">Recent posts</span>
            <strong className="text-2xl font-black text-[var(--text)]">{numberFormat(summary?.posts.length ?? 0)}</strong>
          </article>
          <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <span className="block text-sm text-[var(--text-muted)]">Recent score</span>
            <strong className="text-2xl font-black text-[var(--text)]">{compactNumber(capturedScore)}</strong>
          </article>
        </div>
      </section>

      <section className={`${cardClass} p-5`}>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="ui-eyebrow">Crawler targets</span>
            <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Tracked subreddit feeds</h2>
            <p className={mutedClass}>Each subreddit gets /new at most once per hour and /best at most once per six hours. Home feeds fill any idle time.</p>
          </div>
          <span className="status-pill">{state === "loading" ? "loading" : `updated ${dateTime(summary?.generatedAt)}`}</span>
        </div>

        {state === "loaded" && subredditRows.length === 0 ? <p className={mutedClass}>No subreddit targets yet. The idle crawler seeds r/daresgonewild and expands from tracked subreddits and captured posts.</p> : null}
        {state !== "loaded" && subredditRows.length === 0 ? <p className={mutedClass}>{state === "loading" ? "Loading subreddits…" : "Subreddits have not loaded yet."}</p> : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-[var(--text-muted)]">
              <tr>
                <th className="px-3 py-2">Subreddit</th>
                <th className="px-3 py-2">Feeds</th>
                <th className="px-3 py-2">Targets</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2">Last run</th>
                <th className="px-3 py-2">Next due</th>
                <th className="px-3 py-2">Recent data</th>
              </tr>
            </thead>
            <tbody>
              {subredditRows.map((row) => (
                <tr className="rounded-[14px] bg-[var(--surface-muted)] text-[var(--text)]" key={row.name}>
                  <td className="rounded-l-[14px] px-3 py-3 font-bold"><a className="text-[var(--text)] no-underline hover:underline" href={redditSubredditUrl(row.name)} target="_blank" rel="noreferrer">r/{row.name}</a></td>
                  <td className="px-3 py-3">{row.feeds.length === 0 ? "from posts" : row.feeds.map((feed) => `/${feed.replace(":", " ")}`).join(" · ")}</td>
                  <td className="px-3 py-3">{numberFormat(row.targetCount)}</td>
                  <td className="px-3 py-3"><span className={row.dueCount > 0 ? "status-pill status-panel--wait" : "status-pill"}>{row.dueCount > 0 ? `${row.dueCount} due` : "waiting"}</span></td>
                  <td className="px-3 py-3">{dateTime(row.lastRun)}</td>
                  <td className="px-3 py-3">{dateTime(row.nextDue)}</td>
                  <td className="rounded-r-[14px] px-3 py-3">{numberFormat(row.posts)} posts · {compactNumber(row.score)} score · {compactNumber(row.comments)} comments</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
