"use client";

import { useCallback, useEffect, useState } from "react";

import { ErrorCard } from "@/components/error-card";
import { useDashboardRuntime } from "@/components/dashboard-runtime-provider";
import { fetchIdleCrawlerSummary, type IdleCrawlerSummary } from "@/lib/api/client";
import { cardClass, mutedClass, primaryButtonClass } from "@/lib/ui/styles";
import { compactNumber } from "@/utils/compact-number";
import { numberFormat } from "@/utils/number-format";

type LoadState = "idle" | "loading" | "loaded" | "error";

function dateTime(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function redditUserUrl(username: string): string {
  return `https://www.reddit.com/user/${encodeURIComponent(username)}/`;
}

function sourceLabel(source: string | null): string {
  if (!source) return "crawler";
  return source.replace(/[:_]/g, " ");
}

export function UsersPage() {
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

  const users = summary?.users ?? [];
  const totalUsers = summary?.counts.collectedUsers ?? 0;

  return (
    <>
      {runtime.error ? <ErrorCard message={runtime.error} /> : null}
      {error ? <ErrorCard message={error} /> : null}

      <section className={`${cardClass} mb-4 p-5`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="ui-eyebrow">Discovered users</span>
            <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Users</h2>
            <p className={mutedClass}>Users collected from crawled posts, thread comments, tracked peers, and profile scans. The idle crawler uses this list when subreddit and home work is exhausted.</p>
          </div>
          <button className={primaryButtonClass} type="button" onClick={() => void load()} disabled={state === "loading"}>
            {state === "loading" ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <span className="block text-sm text-[var(--text-muted)]">Collected users</span>
            <strong className="text-2xl font-black text-[var(--text)]">{numberFormat(totalUsers)}</strong>
          </article>
          <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <span className="block text-sm text-[var(--text-muted)]">Shown here</span>
            <strong className="text-2xl font-black text-[var(--text)]">{numberFormat(users.length)}</strong>
          </article>
          <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <span className="block text-sm text-[var(--text-muted)]">Crawler posts</span>
            <strong className="text-2xl font-black text-[var(--text)]">{numberFormat(summary?.counts.posts ?? 0)}</strong>
          </article>
        </div>
      </section>

      <section className={`${cardClass} p-5`}>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="ui-eyebrow">Queue candidates</span>
            <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Collected user profiles</h2>
            <p className={mutedClass}>{totalUsers > users.length ? `Showing the latest ${users.length} of ${numberFormat(totalUsers)} users.` : "Newest users discovered by the crawler."}</p>
          </div>
          <span className="status-pill">{state === "loading" ? "loading" : `updated ${dateTime(summary?.generatedAt)}`}</span>
        </div>

        {state === "loaded" && users.length === 0 ? <p className={mutedClass}>No users collected yet. Keep the Jobs page open with the extension ready and the idle crawler will populate this.</p> : null}
        {state !== "loaded" && users.length === 0 ? <p className={mutedClass}>{state === "loading" ? "Loading users…" : "Users have not loaded yet."}</p> : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {users.map((user) => (
            <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4" key={user.id}>
              <a className="font-extrabold text-[var(--text)] no-underline hover:underline" href={redditUserUrl(user.username)} target="_blank" rel="noreferrer">u/{user.username}</a>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{sourceLabel(user.source)} · {numberFormat(user.postMentions)} post mentions · {numberFormat(user.commentMentions)} comment mentions</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <span className="rounded-[12px] border border-[var(--border)] px-3 py-2 text-[var(--text-muted)]">Karma <strong className="text-[var(--text)]">{user.latestScore === null ? "—" : compactNumber(user.latestScore)}</strong></span>
                <span className="rounded-[12px] border border-[var(--border)] px-3 py-2 text-[var(--text-muted)]">Followers <strong className="text-[var(--text)]">{user.latestFollowers === null ? "—" : compactNumber(user.latestFollowers)}</strong></span>
              </div>
              <small className="mt-3 block text-[var(--text-muted)]">Seen {dateTime(user.lastSeenAt)} · profile crawled {dateTime(user.lastProfileCrawledAt)} · next {dateTime(user.nextProfileCrawlAt)}</small>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
