"use client";

import { FormEvent, useMemo, useState } from "react";

import type { AnalyzeResponse, ContentTypeMetric, SubredditMetric, TimelinePoint } from "@/lib/types";

type LoadState = "idle" | "loading" | "loaded" | "error";

function numberFormat(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(createdUtc: number | null): string {
  if (!createdUtc) return "Unknown";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(createdUtc * 1000));
}

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

function EmptyState() {
  return (
    <section className="empty-card">
      <p>Try a public Reddit username to generate a quick v0.1.1 account read.</p>
      <div className="example-row">
        <span>Public profile</span>
        <span>Recent posts</span>
        <span>Recent comments</span>
        <span>Subreddit signals</span>
      </div>
    </section>
  );
}

function WarningCard({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <section className="warning-card">
      <strong>Partial import</strong>
      <ul>
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </section>
  );
}

function SubredditTable({ rows }: { rows: SubredditMetric[] }) {
  if (rows.length === 0) return <p className="muted">No subreddit data found yet.</p>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Subreddit</th>
            <th>Posts</th>
            <th>Comments</th>
            <th>Total score</th>
            <th>Avg post</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.subreddit}>
              <td>r/{row.subreddit}</td>
              <td>{row.posts}</td>
              <td>{row.comments}</td>
              <td>{numberFormat(row.totalScore)}</td>
              <td>{row.averagePostScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContentTypeList({ rows }: { rows: ContentTypeMetric[] }) {
  if (rows.length === 0) return <p className="muted">No public post formats found yet.</p>;

  return (
    <div className="pill-grid">
      {rows.map((row) => (
        <div className="metric-pill" key={row.type}>
          <strong>{row.type}</strong>
          <span>{row.posts} posts</span>
          <small>{row.averageScore} avg score</small>
        </div>
      ))}
    </div>
  );
}

function Timeline({ rows }: { rows: TimelinePoint[] }) {
  const maxScore = useMemo(() => Math.max(...rows.map((row) => row.score), 1), [rows]);

  if (rows.length === 0) return <p className="muted">No recent activity timeline found.</p>;

  return (
    <div className="timeline" aria-label="Recent activity timeline">
      {rows.map((row) => (
        <div className="timeline-row" key={row.date}>
          <span>{row.date.slice(5)}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(6, (row.score / maxScore) * 100)}%` }} />
          </div>
          <strong>{compactNumber(row.score)}</strong>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [username, setUsername] = useState("");
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);

  async function analyseAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    setError(null);

    const response = await fetch(`/api/analyze?username=${encodeURIComponent(username)}`);
    const payload = (await response.json()) as AnalyzeResponse | { error: string };

    if (!response.ok) {
      setState("error");
      setError("error" in payload ? payload.error : "Unable to analyse this account.");
      return;
    }

    setData(payload as AnalyzeResponse);
    setState("loaded");
  }

  return (
    <main>
      <section className="hero">
        <div className="eyebrow">PaidPolitely v0.1.1</div>
        <h1>Reddit account analytics without OAuth.</h1>
        <p>
          Enter a Reddit username and get a lightweight account read from public profile, post, and comment JSON.
        </p>

        <form onSubmit={analyseAccount} className="search-card">
          <label htmlFor="username">Reddit username</label>
          <div>
            <input
              id="username"
              name="username"
              placeholder="u/MrMrsHK"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
            />
            <button disabled={state === "loading" || username.trim().length === 0} type="submit">
              {state === "loading" ? "Analysing..." : "Analyse"}
            </button>
          </div>
          <small>No Reddit password, cookies, or OAuth app required.</small>
        </form>
      </section>

      {state === "error" ? <div className="error-card">{error}</div> : null}

      {!data ? (
        <EmptyState />
      ) : (
        <section className="dashboard">
          <WarningCard warnings={data.warnings} />

          <div className="profile-card">
            <div>
              <span className="eyebrow">Connected public profile</span>
              <h2>u/{data.profile.username}</h2>
              <p>Created {formatDate(data.profile.createdUtc)}</p>
            </div>
            <div className="karma-total">
              <span>Total karma</span>
              <strong>{numberFormat(data.profile.totalKarma)}</strong>
            </div>
          </div>

          <div className="stat-grid">
            <StatCard label="Recent posts" value={numberFormat(data.analytics.summary.posts)} detail="Last public listing" />
            <StatCard label="Recent comments" value={numberFormat(data.analytics.summary.comments)} detail="Last public listing" />
            <StatCard label="Avg post score" value={String(data.analytics.summary.averagePostScore)} />
            <StatCard label="Best subreddit" value={data.analytics.summary.bestSubreddit ? `r/${data.analytics.summary.bestSubreddit}` : "N/A"} />
            <StatCard
              label="Best UTC hour"
              value={data.analytics.summary.bestPostingHourUtc === null ? "N/A" : `${data.analytics.summary.bestPostingHourUtc}:00`}
              detail="From recent posts"
            />
            <StatCard label="Post score" value={compactNumber(data.analytics.summary.totalPostScore)} />
          </div>

          <section className="panel highlight-panel">
            <h2>Next moves</h2>
            {data.analytics.recommendations.length === 0 ? (
              <p className="muted">Not enough public data for recommendations yet.</p>
            ) : (
              <ul>
                {data.analytics.recommendations.map((recommendation) => (
                  <li key={recommendation}>{recommendation}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel-grid">
            <article className="panel">
              <h2>Subreddit performance</h2>
              <SubredditTable rows={data.analytics.subreddits} />
            </article>
            <article className="panel">
              <h2>Content formats</h2>
              <ContentTypeList rows={data.analytics.contentTypes} />
            </article>
          </section>

          <section className="panel">
            <h2>Recent activity score</h2>
            <Timeline rows={data.analytics.timeline} />
          </section>

          <section className="panel-grid">
            <article className="panel">
              <h2>Top posts</h2>
              <div className="link-list">
                {data.analytics.topPosts.map((post) => (
                  <a href={post.permalink} target="_blank" rel="noreferrer" key={post.id}>
                    <strong>{post.title}</strong>
                    <span>r/{post.subreddit} · {numberFormat(post.score)} score · {post.numComments} comments</span>
                  </a>
                ))}
              </div>
            </article>
            <article className="panel">
              <h2>Top comments</h2>
              <div className="link-list">
                {data.analytics.topComments.map((comment) => (
                  <a href={comment.permalink} target="_blank" rel="noreferrer" key={comment.id}>
                    <strong>{comment.linkTitle ?? `Comment in r/${comment.subreddit}`}</strong>
                    <span>r/{comment.subreddit} · {numberFormat(comment.score)} score</span>
                  </a>
                ))}
              </div>
            </article>
          </section>
        </section>
      )}
    </main>
  );
}
