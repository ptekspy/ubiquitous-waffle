"use client";

import { FormEvent, useMemo, useState } from "react";

import type { AnalyzeResponse, ContentTypeMetric, SubredditMetric, TimelinePoint } from "@/lib/types";

type LoadState = "idle" | "loading" | "loaded" | "error";

const BROWSER_CAPTURE_SNIPPET = `(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const text = (node) => node?.textContent?.trim() ?? "";
  const numberFrom = (value) => {
    const raw = String(value ?? "").trim().toLowerCase().replace(/,/g, "");
    const match = raw.match(/-?\\d+(?:\\.\\d+)?\\s*[km]?/);
    if (!match) return 0;
    const token = match[0].replace(/\\s/g, "");
    const multiplier = token.endsWith("k") ? 1000 : token.endsWith("m") ? 1000000 : 1;
    return Math.round(parseFloat(token) * multiplier);
  };
  const absolute = (href) => {
    if (!href) return "";
    if (href.startsWith("https://")) return href;
    if (href.startsWith("/")) return "https://www.reddit.com" + href;
    return "https://www.reddit.com/" + href;
  };
  const redditIdFromHref = (href) => href?.match(/\\/comments\\/([^/]+)\\//i)?.[1] ?? "";
  const subredditFromHref = (href) => href?.match(/\\/r\\/([^/]+)\\//i)?.[1] ?? "";
  const username = location.pathname.match(/\\/user\\/([^/]+)/i)?.[1] || location.pathname.match(/\\/u\\/([^/]+)/i)?.[1] || document.querySelector('[data-testid="profile-name"]')?.textContent?.replace(/^u\\//i, "") || "";
  const postsByKey = new Map();
  const visiblePostNodes = () => {
    const shredditPosts = Array.from(document.querySelectorAll("shreddit-post"));
    if (shredditPosts.length) return shredditPosts;
    return Array.from(document.querySelectorAll('article, [data-testid="post-container"]'));
  };
  const captureVisiblePosts = () => {
    for (const [index, node] of visiblePostNodes().entries()) {
      const href = node.getAttribute?.("permalink") || node.querySelector('a[href*="/comments/"]')?.getAttribute("href") || "";
      const idFromHref = redditIdFromHref(href);
      const id = node.getAttribute?.("id") || (idFromHref ? "t3_" + idFromHref : "browser-post-" + index);
      const title = text(node.querySelector('[slot="title"], a[slot="title"], h1, h2, h3')) || text(node.querySelector('a[href*="/comments/"]'));
      const subredditAttribute = node.getAttribute?.("subreddit-prefixed-name") || node.getAttribute?.("subreddit") || "";
      const subreddit = subredditFromHref(href) || subredditAttribute.replace(/^r\\//i, "");
      const score = numberFrom(node.getAttribute?.("score") || text(node.querySelector('[aria-label*="upvote"], [id*="score"], faceplate-number')));
      const numComments = numberFrom(node.getAttribute?.("comment-count") || text(node.querySelector('a[href*="/comments/"][aria-label], [aria-label*="comment"]')));
      const createdRaw = node.getAttribute?.("created-timestamp") || node.getAttribute?.("created") || node.querySelector("time")?.getAttribute("datetime") || "";
      const createdParsed = Date.parse(createdRaw);
      const createdUtc = Number.isFinite(createdParsed) ? Math.floor(createdParsed / 1000) : Math.floor(Date.now() / 1000);
      if (!title || !subreddit || !href) continue;
      const key = idFromHref || id || href;
      const post = { id, title, subreddit, permalink: href, score, numComments, createdUtc };
      const existing = postsByKey.get(key);
      if (!existing || post.score + post.numComments > existing.score + existing.numComments) {
        postsByKey.set(key, post);
      }
    }
  };
  const startingScrollY = window.scrollY;
  let lastHeight = 0;
  let lastCount = 0;
  let unchangedPasses = 0;
  window.scrollTo(0, 0);
  await sleep(600);
  captureVisiblePosts();
  for (let pass = 0; pass < 90 && unchangedPasses < 5; pass += 1) {
    window.scrollBy(0, Math.max(700, window.innerHeight * 0.85));
    await sleep(650);
    captureVisiblePosts();
    const height = document.scrollingElement?.scrollHeight || document.body.scrollHeight;
    const count = postsByKey.size;
    if (height === lastHeight && count === lastCount) unchangedPasses += 1;
    else unchangedPasses = 0;
    lastHeight = height;
    lastCount = count;
  }
  window.scrollTo(0, 0);
  await sleep(500);
  captureVisiblePosts();
  window.scrollTo(0, startingScrollY);
  const payload = {
    source: "paidpolitely-reddit-browser-import-v2",
    capturedAt: new Date().toISOString(),
    username,
    profile: { username },
    posts: Array.from(postsByKey.values()),
    comments: []
  };
  const json = JSON.stringify(payload, null, 2);
  try {
    await navigator.clipboard.writeText(json);
  } catch {
    copy(json);
  }
  console.log("PaidPolitely capture copied", payload);
})();`;

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

async function readJsonResponse(response: Response): Promise<AnalyzeResponse | { error: string }> {
  try {
    return (await response.json()) as AnalyzeResponse | { error: string };
  } catch {
    return { error: "The server returned a non-JSON response." };
  }
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
      <p>Try a public Reddit username first. If Reddit blocks the server request, use the browser capture fallback below.</p>
      <div className="example-row">
        <span>Public profile</span>
        <span>Recent posts</span>
        <span>Browser import</span>
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

function BrowserImportCard({
  importPayload,
  setImportPayload,
  onImport,
  loading,
}: {
  importPayload: string;
  setImportPayload: (value: string) => void;
  onImport: () => void;
  loading: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copySnippet() {
    await navigator.clipboard.writeText(BROWSER_CAPTURE_SNIPPET);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="import-card">
      <div>
        <span className="eyebrow">Fallback when Reddit returns 403</span>
        <h2>Browser capture import</h2>
        <p>
          Open the Reddit profile in your browser, paste the capture snippet into DevTools console, let it auto-scroll the
          profile, then paste the copied JSON here.
        </p>
      </div>
      <div className="import-actions">
        <button type="button" onClick={copySnippet}>
          {copied ? "Copied" : "Copy auto-scroll capture snippet"}
        </button>
      </div>
      <textarea
        value={importPayload}
        onChange={(event) => setImportPayload(event.target.value)}
        placeholder='Paste the copied { "source": "paidpolitely-reddit-browser-import-v2", ... } JSON here'
      />
      <button type="button" onClick={onImport} disabled={loading || importPayload.trim().length === 0}>
        {loading ? "Importing..." : "Analyse browser import"}
      </button>
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
  const [importPayload, setImportPayload] = useState("");
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);

  async function analyseAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    setError(null);

    try {
      const response = await fetch(`/api/analyze?username=${encodeURIComponent(username)}`);
      const payload = await readJsonResponse(response);

      if (!response.ok) {
        setState("error");
        setError("error" in payload ? payload.error : "Unable to analyse this account.");
        return;
      }

      setData(payload as AnalyzeResponse);
      setState("loaded");
    } catch {
      setState("error");
      setError("The request failed before the API could respond. Use the browser capture fallback below.");
    }
  }

  async function analyseImport() {
    setState("loading");
    setError(null);

    try {
      const response = await fetch("/api/analyze/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: importPayload }),
      });
      const payload = await readJsonResponse(response);

      if (!response.ok) {
        setState("error");
        setError("error" in payload ? payload.error : "Unable to analyse browser import.");
        return;
      }

      setData(payload as AnalyzeResponse);
      setState("loaded");
    } catch {
      setState("error");
      setError("The browser import request failed before the API could respond.");
    }
  }

  return (
    <main>
      <section className="hero">
        <div className="eyebrow">PaidPolitely v0.1.3</div>
        <h1>Reddit account analytics without OAuth.</h1>
        <p>
          Enter a Reddit username for a server-side attempt, or use browser capture when Reddit blocks public JSON.
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

      <BrowserImportCard
        importPayload={importPayload}
        setImportPayload={setImportPayload}
        onImport={analyseImport}
        loading={state === "loading"}
      />

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
