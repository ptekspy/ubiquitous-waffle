"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { BROWSER_CAPTURE_SNIPPET } from "@/lib/browser-capture-snippet";
import type { AnalyzeResponse, ContentTypeMetric, SubredditMetric, TimelinePoint } from "@/lib/types";

type LoadState = "idle" | "loading" | "loaded" | "error";
type ExtensionState = "not-configured" | "checking" | "missing" | "installed" | "scanning" | "error";

type ExtensionPingResponse = {
  ok?: boolean;
  status?: string;
  version?: string;
  name?: string;
  error?: string;
};

type ExtensionScanResponse =
  | {
      ok: true;
      status: "captured";
      payload: unknown;
    }
  | {
      ok: false;
      status?: string;
      error: string;
    };

type ChromeRuntime = {
  sendMessage?: (extensionId: string, message: unknown, callback: (response: unknown) => void) => void;
  lastError?: { message?: string };
};

declare global {
  interface Window {
    chrome?: {
      runtime?: ChromeRuntime;
    };
  }
}

const EXTENSION_ID = process.env.NEXT_PUBLIC_PAIDPOLITELY_EXTENSION_ID?.trim() ?? "";
const EXTENSION_STORE_URL = process.env.NEXT_PUBLIC_PAIDPOLITELY_EXTENSION_STORE_URL?.trim() ?? "";

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

function normaliseUsernameInput(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/(www\.)?reddit\.com\/user\//i, "")
    .replace(/^https?:\/\/(www\.)?reddit\.com\/u\//i, "")
    .replace(/^u\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .trim();
}

async function readJsonResponse(response: Response): Promise<AnalyzeResponse | { error: string }> {
  try {
    return (await response.json()) as AnalyzeResponse | { error: string };
  } catch {
    return { error: "The server returned a non-JSON response." };
  }
}

function sendExtensionMessage<TResponse>(message: unknown): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    if (!EXTENSION_ID) {
      reject(new Error("PaidPolitely extension ID is not configured."));
      return;
    }

    const runtime = window.chrome?.runtime;
    if (!runtime?.sendMessage) {
      reject(new Error("Chrome extension messaging is unavailable in this browser."));
      return;
    }

    runtime.sendMessage(EXTENSION_ID, message, (response) => {
      const lastError = window.chrome?.runtime?.lastError;
      if (lastError?.message) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(response as TResponse);
    });
  });
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
        <span>Extension bridge</span>
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

function ExtensionBridgeCard({
  state,
  message,
  version,
  username,
  loading,
  onCheck,
  onScan,
}: {
  state: ExtensionState;
  message: string;
  version: string | null;
  username: string;
  loading: boolean;
  onCheck: () => void;
  onScan: () => void;
}) {
  const normalisedUsername = normaliseUsernameInput(username);
  const canScan = state === "installed" && !loading && normalisedUsername.length > 0;
  const statusLabel =
    state === "installed"
      ? `Installed${version ? ` · v${version}` : ""}`
      : state === "scanning"
        ? "Scanning Reddit"
        : state === "checking"
          ? "Checking"
          : state === "missing"
            ? "Not detected"
            : state === "not-configured"
              ? "Extension ID needed"
              : "Extension error";

  return (
    <section className="extension-card">
      <div className="extension-card-header">
        <div>
          <span className="eyebrow">One-click browser scan</span>
          <h2>PaidPolitely Capture extension</h2>
        </div>
        <span className={`status-pill status-${state}`}>{statusLabel}</span>
      </div>
      <p>
        The website checks for the installed extension. If it is installed, it can open or focus the Reddit profile tab,
        signpost the user if Reddit needs login/age confirmation, scan visible post metadata, and import the result here.
      </p>
      {message ? <p className="bridge-message">{message}</p> : null}
      <div className="bridge-actions">
        <button type="button" onClick={onCheck} disabled={state === "checking" || state === "scanning"}>
          {state === "checking" ? "Checking..." : "Check extension"}
        </button>
        <button type="button" onClick={onScan} disabled={!canScan}>
          {state === "scanning" || loading ? "Scanning..." : normalisedUsername ? `Scan u/${normalisedUsername}` : "Enter username to scan"}
        </button>
        {EXTENSION_STORE_URL ? (
          <a className="secondary-link" href={EXTENSION_STORE_URL} target="_blank" rel="noreferrer">
            Install extension
          </a>
        ) : null}
      </div>
      <div className="install-steps">
        <strong>Local manual install flow</strong>
        <ol>
          <li>Open <code>chrome://extensions</code>.</li>
          <li>Enable <strong>Developer mode</strong>.</li>
          <li>Click <strong>Load unpacked</strong> and select this repo&apos;s <code>extension</code> folder.</li>
          <li>Copy the unpacked extension ID into <code>NEXT_PUBLIC_PAIDPOLITELY_EXTENSION_ID</code>.</li>
          <li>Restart <code>pnpm dev</code>, reload this page, then click <strong>Check extension</strong>.</li>
        </ol>
      </div>
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
        <span className="eyebrow">Manual fallback</span>
        <h2>Browser capture import</h2>
        <p>
          Keep this as a fallback while the extension is in local development. Open the Reddit profile, paste the capture
          snippet into DevTools console, let it auto-scroll the profile, then paste the copied JSON here.
        </p>
      </div>
      <div className="import-actions">
        <button type="button" onClick={copySnippet}>
          {copied ? "Copied" : "Copy robust capture snippet"}
        </button>
      </div>
      <textarea
        value={importPayload}
        onChange={(event) => setImportPayload(event.target.value)}
        placeholder='Paste the copied { "source": "paidpolitely-reddit-browser-import-v4", ... } JSON here'
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
  const [extensionState, setExtensionState] = useState<ExtensionState>(EXTENSION_ID ? "checking" : "not-configured");
  const [extensionMessage, setExtensionMessage] = useState(
    EXTENSION_ID
      ? "Checking whether PaidPolitely Capture is installed."
      : "Set NEXT_PUBLIC_PAIDPOLITELY_EXTENSION_ID after loading the unpacked extension. Until then, the website correctly treats the extension bridge as unavailable."
  );
  const [extensionVersion, setExtensionVersion] = useState<string | null>(null);

  useEffect(() => {
    void checkExtension();
  }, []);

  async function checkExtension() {
    if (!EXTENSION_ID) {
      setExtensionState("not-configured");
      setExtensionVersion(null);
      setExtensionMessage("No extension ID is configured yet. Load the unpacked extension, copy its ID, add it to .env.local, then restart the dev server.");
      return;
    }

    setExtensionState("checking");
    setExtensionMessage("Checking for PaidPolitely Capture...");

    try {
      const response = await sendExtensionMessage<ExtensionPingResponse>({ type: "PAIDPOLITELY_PING" });
      if (response?.ok) {
        setExtensionState("installed");
        setExtensionVersion(response.version ?? null);
        setExtensionMessage("PaidPolitely Capture is installed and ready. The website can now request one-click Reddit scans.");
        return;
      }

      setExtensionState("error");
      setExtensionVersion(null);
      setExtensionMessage(response?.error ?? "PaidPolitely Capture responded, but not with a valid ping response.");
    } catch (extensionError) {
      setExtensionState("missing");
      setExtensionVersion(null);
      setExtensionMessage(extensionError instanceof Error ? extensionError.message : "PaidPolitely Capture was not detected.");
    }
  }

  async function importRawPayload(raw: string) {
    setState("loading");
    setError(null);

    try {
      const response = await fetch("/api/analyze/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      const payload = await readJsonResponse(response);

      if (!response.ok) {
        setState("error");
        setError("error" in payload ? payload.error : "Unable to analyse browser import.");
        return false;
      }

      setData(payload as AnalyzeResponse);
      setState("loaded");
      return true;
    } catch {
      setState("error");
      setError("The browser import request failed before the API could respond.");
      return false;
    }
  }

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
    await importRawPayload(importPayload);
  }

  async function scanWithExtension() {
    const normalisedUsername = normaliseUsernameInput(username);
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(normalisedUsername)) {
      setState("error");
      setError("Enter a valid Reddit username before scanning with the extension.");
      return;
    }

    setState("loading");
    setError(null);
    setExtensionState("scanning");
    setExtensionMessage(`Opening or focusing Reddit for u/${normalisedUsername}. If Reddit asks for login or age confirmation, follow the signpost in the Reddit tab.`);

    try {
      const response = await sendExtensionMessage<ExtensionScanResponse>({
        type: "PAIDPOLITELY_SCAN_REDDIT_PROFILE",
        username: normalisedUsername,
      });

      if (!response.ok) {
        setState("error");
        setExtensionState("installed");
        setExtensionMessage(response.error);
        setError(response.error);
        return;
      }

      const raw = JSON.stringify(response.payload, null, 2);
      setImportPayload(raw);
      const imported = await importRawPayload(raw);
      setExtensionState("installed");
      setExtensionMessage(imported ? `Captured and imported u/${normalisedUsername} through the extension.` : "The extension captured data, but the app could not import it.");
    } catch (extensionError) {
      setState("error");
      setExtensionState("missing");
      const message = extensionError instanceof Error ? extensionError.message : "PaidPolitely Capture was not detected.";
      setExtensionMessage(message);
      setError(message);
    }
  }

  return (
    <main>
      <section className="hero">
        <div className="eyebrow">PaidPolitely v0.2.0</div>
        <h1>Reddit account analytics without OAuth.</h1>
        <p>
          Enter a Reddit username, scan with the local extension bridge, or fall back to browser capture when Reddit blocks
          public JSON.
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
          <small>No Reddit password, cookies, OAuth app, or session token required.</small>
        </form>
      </section>

      {state === "error" ? <div className="error-card">{error}</div> : null}

      <ExtensionBridgeCard
        state={extensionState}
        message={extensionMessage}
        version={extensionVersion}
        username={username}
        loading={state === "loading"}
        onCheck={checkExtension}
        onScan={scanWithExtension}
      />

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
