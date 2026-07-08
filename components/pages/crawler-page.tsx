"use client";

import { useCallback, useEffect, useState } from "react";

import { ErrorCard } from "@/components/error-card";
import { useDashboardRuntime } from "@/components/dashboard-runtime-provider";
import { fetchIdleCrawlerSummary, type IdleCrawlerSummary } from "@/lib/api/client";
import { cardClass, mutedClass, primaryButtonClass } from "@/lib/ui/styles";
import { compactNumber } from "@/utils/compact-number";

type LoadState = "idle" | "loading" | "loaded" | "error";

function dateTime(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function statusClass(status: string | null): string {
  if (status === "COMPLETED") return "status-pill status-panel--ok";
  if (status === "RUNNING") return "status-pill status-panel--wait";
  if (status === "FAILED") return "status-pill status-panel--off";
  return "status-pill";
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
      <span className="block text-sm text-[var(--text-muted)]">{label}</span>
      <strong className="text-2xl font-black text-[var(--text)]">{compactNumber(value)}</strong>
    </article>
  );
}

function redditUserUrl(username: string): string {
  return `https://www.reddit.com/user/${encodeURIComponent(username)}/`;
}

export function CrawlerPage() {
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

  return (
    <>
      {runtime.error ? <ErrorCard message={runtime.error} /> : null}
      {error ? <ErrorCard message={error} /> : null}

      <section className={`${cardClass} mb-4 p-5`}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="ui-eyebrow">Always-on browser crawler</span>
            <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Crawler data</h2>
            <p className={mutedClass}>View the idle crawler targets, recent posts, and collected users. The jobs page runs this automatically while the extension is ready.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={primaryButtonClass} type="button" onClick={() => void load()} disabled={state === "loading"}>
              {state === "loading" ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {summary ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <CountCard label="Targets" value={summary.counts.targets} />
            <CountCard label="Due now" value={summary.counts.dueTargets} />
            <CountCard label="Collected users" value={summary.counts.collectedUsers} />
            <CountCard label="Posts" value={summary.counts.posts} />
            <CountCard label="Comments" value={summary.counts.comments} />
          </div>
        ) : (
          <p className={mutedClass}>{state === "loading" ? "Loading crawler data…" : "Crawler data has not loaded yet."}</p>
        )}
      </section>

      {summary ? (
        <div className="grid gap-4">
          <section className={`${cardClass} p-5`}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <span className="ui-eyebrow">Queue</span>
                <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Crawler targets</h2>
                <p className={mutedClass}>Subreddit /new is capped to once per hour per subreddit. Subreddit /best is capped to once per six hours. Home feeds fill the gaps.</p>
              </div>
              <span className="status-pill">{dateTime(summary.generatedAt)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
                <thead className="text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Target</th>
                    <th className="px-3 py-2">Kind</th>
                    <th className="px-3 py-2">Last run</th>
                    <th className="px-3 py-2">Next due</th>
                    <th className="px-3 py-2">Last result</th>
                    <th className="px-3 py-2">Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.targets.map((target) => (
                    <tr className="rounded-[14px] bg-[var(--surface-muted)] text-[var(--text)]" key={target.id}>
                      <td className="rounded-l-[14px] px-3 py-3 font-bold">{target.label}</td>
                      <td className="px-3 py-3">{target.kind.replace("_", " ")}</td>
                      <td className="px-3 py-3">{dateTime(target.lastCompletedAt)}</td>
                      <td className="px-3 py-3">{dateTime(target.nextDueAt)}</td>
                      <td className="px-3 py-3"><span className={statusClass(target.lastStatus)}>{target.lastStatus ?? "waiting"}</span>{target.lastError ? <small className="mt-1 block max-w-[260px] text-[var(--text-muted)]">{target.lastError}</small> : null}</td>
                      <td className="rounded-r-[14px] px-3 py-3">{target.lastPostCount} posts · {target.lastCommentCount} comments</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={`${cardClass} p-5`}>
            <div className="mb-4">
              <span className="ui-eyebrow">Captured posts</span>
              <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Recent crawler posts</h2>
              <p className={mutedClass}>Posts found from active subreddit feeds and home feeds.</p>
            </div>
            <div className="grid gap-3">
              {summary.posts.length === 0 ? <p className={mutedClass}>No idle-crawled posts yet.</p> : null}
              {summary.posts.map((post) => (
                <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4" key={post.id}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <a className="font-extrabold text-[var(--text)] no-underline hover:underline" href={post.permalink} target="_blank" rel="noreferrer">{post.title}</a>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">r/{post.subreddit} · {post.author ? `u/${post.author}` : "unknown author"} · /{post.feed}</p>
                    </div>
                    <span className="status-pill">{compactNumber(post.score)} score · {compactNumber(post.numComments)} comments</span>
                  </div>
                  <small className="mt-3 block text-[var(--text-muted)]">Seen {dateTime(post.lastSeenAt)}</small>
                </article>
              ))}
            </div>
          </section>

          <section className={`${cardClass} p-5`}>
            <div className="mb-4">
              <span className="ui-eyebrow">Discovered users</span>
              <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Collected users</h2>
              <p className={mutedClass}>These are users discovered from posts, thread comments, and tracked peers. The idle crawler uses them after subreddit and home work.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {summary.users.length === 0 ? <p className={mutedClass}>No collected users yet.</p> : null}
              {summary.users.map((user) => (
                <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4" key={user.id}>
                  <a className="font-extrabold text-[var(--text)] no-underline hover:underline" href={redditUserUrl(user.username)} target="_blank" rel="noreferrer">u/{user.username}</a>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">{user.source ?? "crawler"} · {user.postMentions} post mentions · {user.commentMentions} comment mentions</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <span className="rounded-[12px] border border-[var(--border)] px-3 py-2 text-[var(--text-muted)]">Karma <strong className="text-[var(--text)]">{user.latestScore === null ? "—" : compactNumber(user.latestScore)}</strong></span>
                    <span className="rounded-[12px] border border-[var(--border)] px-3 py-2 text-[var(--text-muted)]">Followers <strong className="text-[var(--text)]">{user.latestFollowers === null ? "—" : compactNumber(user.latestFollowers)}</strong></span>
                  </div>
                  <small className="mt-3 block text-[var(--text-muted)]">Profile crawled {dateTime(user.lastProfileCrawledAt)} · next {dateTime(user.nextProfileCrawlAt)}</small>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
