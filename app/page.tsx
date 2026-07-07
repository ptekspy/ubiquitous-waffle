"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { BROWSER_CAPTURE_SNIPPET } from "@/lib/browser-capture-snippet";
import type { AnalyzeResponse, ContentTypeMetric, SubredditMetric, TimelinePoint } from "@/lib/types";

type LoadState = "idle" | "loading" | "loaded" | "error";
type ExtensionState = "not-configured" | "checking" | "missing" | "installed" | "scanning" | "error";
type StepState = "done" | "active" | "todo" | "error";

type ExtensionPingResponse = {
  ok?: boolean;
  status?: string;
  version?: string;
  name?: string;
  bridge?: string;
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
const BRIDGE_REQUEST = "PAIDPOLITELY_EXTENSION_BRIDGE_REQUEST";
const BRIDGE_RESPONSE = "PAIDPOLITELY_EXTENSION_BRIDGE_RESPONSE";

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

function validUsername(value: string): boolean {
  return /^[A-Za-z0-9_-]{3,20}$/.test(normaliseUsernameInput(value));
}

async function readJsonResponse(response: Response): Promise<AnalyzeResponse | { error: string }> {
  try {
    return (await response.json()) as AnalyzeResponse | { error: string };
  } catch {
    return { error: "The server returned a non-JSON response." };
  }
}

function sendBridgeMessage<TResponse>(message: unknown, timeoutMs = 2200): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const requestId = `paidpolitely-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("PaidPolitely Capture bridge was not detected on this page. Reload the page after loading/reloading the extension."));
    }, timeoutMs);

    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== "paidpolitely-extension" || data.type !== BRIDGE_RESPONSE || data.requestId !== requestId) return;

      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(data.response as TResponse);
    }

    window.addEventListener("message", onMessage);
    window.postMessage(
      {
        source: "paidpolitely-web",
        type: BRIDGE_REQUEST,
        requestId,
        payload: message,
      },
      window.location.origin
    );
  });
}

function sendDirectExtensionMessage<TResponse>(message: unknown): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    if (!EXTENSION_ID) {
      reject(new Error("No extension ID fallback is configured."));
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

async function sendExtensionMessage<TResponse>(message: unknown): Promise<TResponse> {
  try {
    return await sendBridgeMessage<TResponse>(message);
  } catch (bridgeError) {
    if (!EXTENSION_ID) throw bridgeError;
    return sendDirectExtensionMessage<TResponse>(message);
  }
}

function extensionLabel(state: ExtensionState, version: string | null): string {
  if (state === "installed") return `Extension ready${version ? ` · v${version}` : ""}`;
  if (state === "scanning") return "Scanning Reddit";
  if (state === "checking") return "Checking extension";
  if (state === "missing") return "Extension not detected";
  if (state === "not-configured") return "Extension not configured";
  return "Extension error";
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

function JourneyStep({ number, title, body, state }: { number: number; title: string; body: string; state: StepState }) {
  return (
    <li className={`journey-step journey-${state}`}>
      <span>{state === "done" ? "✓" : number}</span>
      <div>
        <strong>{title}</strong>
        <small>{body}</small>
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <section className="empty-card">
      <span className="eyebrow">Waiting for first scan</span>
      <h2>Run the extension scan to build the dashboard.</h2>
      <p>
        The extension uses the normal Reddit tab in your browser, then imports only the visible public post metadata into this
        page. No passwords, cookies, OAuth tokens, session tokens, or private messages are read.
      </p>
    </section>
  );
}

function WarningCard({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <section className="warning-card">
      <strong>Import notes</strong>
      <ul>
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </section>
  );
}

function ScanSetupCard({
  username,
  setUsername,
  extensionState,
  extensionMessage,
  extensionVersion,
  hasData,
  loading,
  onCheck,
  onScan,
  onTryPublicJson,
}: {
  username: string;
  setUsername: (value: string) => void;
  extensionState: ExtensionState;
  extensionMessage: string;
  extensionVersion: string | null;
  hasData: boolean;
  loading: boolean;
  onCheck: () => void;
  onScan: () => void;
  onTryPublicJson: () => void;
}) {
  const normalisedUsername = normaliseUsernameInput(username);
  const hasValidUsername = validUsername(username);
  const extensionReady = extensionState === "installed";
  const canScan = extensionReady && hasValidUsername && !loading;
  const extensionStepState: StepState = extensionReady ? "done" : extensionState === "missing" || extensionState === "error" ? "error" : "active";
  const usernameStepState: StepState = hasValidUsername ? "done" : extensionReady ? "active" : "todo";
  const captureStepState: StepState = extensionState === "scanning" || loading ? "active" : hasData ? "done" : canScan ? "active" : "todo";
  const reviewStepState: StepState = hasData ? "done" : "todo";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canScan) onScan();
  }

  return (
    <section className="journey-card">
      <div className="journey-copy">
        <span className="eyebrow">Recommended flow</span>
        <h2>Scan a Reddit profile with the browser extension.</h2>
        <p>
          PaidPolitely opens or focuses the Reddit profile, checks it is visible, captures the public post rows, removes Reddit
          promo/game cards, and builds the report here.
        </p>
        <div className={`bridge-banner bridge-${extensionState}`}>
          <span className="bridge-dot" />
          <div>
            <strong>{extensionLabel(extensionState, extensionVersion)}</strong>
            <small>{extensionMessage}</small>
          </div>
          <button type="button" onClick={onCheck} disabled={extensionState === "checking" || extensionState === "scanning"}>
            {extensionState === "checking" ? "Checking..." : "Recheck"}
          </button>
        </div>
      </div>

      <ol className="journey-list">
        <JourneyStep number={1} title="Extension" body="Detect PaidPolitely Capture in this browser." state={extensionStepState} />
        <JourneyStep number={2} title="Username" body="Paste a username, profile URL, or u/name." state={usernameStepState} />
        <JourneyStep number={3} title="Capture" body="Open Reddit, scroll the profile, and import metadata." state={captureStepState} />
        <JourneyStep number={4} title="Review" body="Read the subreddit, timing, and content signals." state={reviewStepState} />
      </ol>

      <form className="scan-form" onSubmit={submit}>
        <label htmlFor="username">Reddit profile</label>
        <div className="scan-controls">
          <input
            id="username"
            name="username"
            placeholder="u/MrMrsHK or reddit.com/user/MrMrsHK"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
          />
          <button className="primary-action" disabled={!canScan} type="submit">
            {extensionState === "scanning" || loading ? "Scanning..." : normalisedUsername ? `Scan u/${normalisedUsername}` : "Scan profile"}
          </button>
        </div>
        <div className="scan-help-row">
          <small>{extensionReady ? "Extension ready. Reddit will open in a tab if needed." : "Install or reload the extension, then recheck."}</small>
          <button className="text-action" type="button" onClick={onTryPublicJson} disabled={!hasValidUsername || loading}>
            Try server-side JSON instead
          </button>
        </div>
        {EXTENSION_STORE_URL ? (
          <a className="secondary-link" href={EXTENSION_STORE_URL} target="_blank" rel="noreferrer">
            Install extension
          </a>
        ) : null}
      </form>
    </section>
  );
}

function ManualImportCard({
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
    <details className="fallback-card">
      <summary>
        <span>Manual import / debugging fallback</span>
        <small>Use this only if the extension bridge fails.</small>
      </summary>
      <div className="fallback-body">
        <p>
          Open the Reddit profile, paste the robust capture snippet into DevTools, let it scroll, then paste the copied JSON here.
          The importer will still clean duplicates, game cards, and comment-link rows.
        </p>
        <div className="import-actions">
          <button type="button" onClick={copySnippet}>
            {copied ? "Snippet copied" : "Copy robust capture snippet"}
          </button>
        </div>
        <textarea
          value={importPayload}
          onChange={(event) => setImportPayload(event.target.value)}
          placeholder='Paste { "source": "paidpolitely-reddit-extension-capture-v2", ... } or browser-import JSON here'
        />
        <button type="button" onClick={onImport} disabled={loading || importPayload.trim().length === 0}>
          {loading ? "Importing..." : "Analyse pasted JSON"}
        </button>
      </div>
    </details>
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

function Dashboard({ data }: { data: AnalyzeResponse }) {
  return (
    <section className="dashboard">
      <WarningCard warnings={data.warnings} />

      <div className="profile-card">
        <div>
          <span className="eyebrow">Latest scan</span>
          <h2>u/{data.profile.username}</h2>
          <p>Profile created {formatDate(data.profile.createdUtc)}</p>
        </div>
        <div className="karma-total">
          <span>Total karma</span>
          <strong>{numberFormat(data.profile.totalKarma)}</strong>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Captured posts" value={numberFormat(data.analytics.summary.posts)} detail="Cleaned public rows" />
        <StatCard label="Captured comments" value={numberFormat(data.analytics.summary.comments)} detail="When available" />
        <StatCard label="Avg post score" value={String(data.analytics.summary.averagePostScore)} />
        <StatCard label="Best subreddit" value={data.analytics.summary.bestSubreddit ? `r/${data.analytics.summary.bestSubreddit}` : "N/A"} />
        <StatCard
          label="Best UTC hour"
          value={data.analytics.summary.bestPostingHourUtc === null ? "N/A" : `${data.analytics.summary.bestPostingHourUtc}:00`}
          detail="From captured posts"
        />
        <StatCard label="Captured score" value={compactNumber(data.analytics.summary.totalPostScore)} />
      </div>

      <section className="panel highlight-panel">
        <div className="panel-heading">
          <span className="eyebrow">Actionable readout</span>
          <h2>Next moves</h2>
        </div>
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
          <div className="panel-heading">
            <span className="eyebrow">Where it works</span>
            <h2>Subreddit performance</h2>
          </div>
          <SubredditTable rows={data.analytics.subreddits} />
        </article>
        <article className="panel">
          <div className="panel-heading">
            <span className="eyebrow">Format signal</span>
            <h2>Content formats</h2>
          </div>
          <ContentTypeList rows={data.analytics.contentTypes} />
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <span className="eyebrow">Momentum</span>
          <h2>Recent activity score</h2>
        </div>
        <Timeline rows={data.analytics.timeline} />
      </section>

      <section className="panel-grid">
        <article className="panel">
          <div className="panel-heading">
            <span className="eyebrow">Repeat patterns</span>
            <h2>Top posts</h2>
          </div>
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
          <div className="panel-heading">
            <span className="eyebrow">Conversation signal</span>
            <h2>Top comments</h2>
          </div>
          {data.analytics.topComments.length === 0 ? (
            <p className="muted">No comments were captured in this browser import.</p>
          ) : (
            <div className="link-list">
              {data.analytics.topComments.map((comment) => (
                <a href={comment.permalink} target="_blank" rel="noreferrer" key={comment.id}>
                  <strong>{comment.linkTitle ?? `Comment in r/${comment.subreddit}`}</strong>
                  <span>r/{comment.subreddit} · {numberFormat(comment.score)} score</span>
                </a>
              ))}
            </div>
          )}
        </article>
      </section>
    </section>
  );
}

export default function Home() {
  const [username, setUsername] = useState("");
  const [importPayload, setImportPayload] = useState("");
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [extensionState, setExtensionState] = useState<ExtensionState>("checking");
  const [extensionMessage, setExtensionMessage] = useState("Checking whether PaidPolitely Capture is installed on this page.");
  const [extensionVersion, setExtensionVersion] = useState<string | null>(null);

  useEffect(() => {
    void checkExtension();
  }, []);

  async function checkExtension() {
    setExtensionState("checking");
    setExtensionMessage("Checking for PaidPolitely Capture. Reload this page after reloading the unpacked extension.");

    try {
      const response = await sendExtensionMessage<ExtensionPingResponse>({ type: "PAIDPOLITELY_PING" });
      if (response?.ok) {
        setExtensionState("installed");
        setExtensionVersion(response.version ?? null);
        setExtensionMessage(`Ready${response.bridge ? ` via ${response.bridge}` : ""}.`);
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

  async function analysePublicJson() {
    const normalisedUsername = normaliseUsernameInput(username);
    if (!validUsername(normalisedUsername)) {
      setState("error");
      setError("Enter a valid Reddit username before trying public JSON.");
      return;
    }

    setState("loading");
    setError(null);

    try {
      const response = await fetch(`/api/analyze?username=${encodeURIComponent(normalisedUsername)}`);
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
      setError("The request failed before the API could respond. Use the extension scan instead.");
    }
  }

  async function analyseImport() {
    await importRawPayload(importPayload);
  }

  async function scanWithExtension() {
    const normalisedUsername = normaliseUsernameInput(username);
    if (!validUsername(normalisedUsername)) {
      setState("error");
      setError("Enter a valid Reddit username before scanning with the extension.");
      return;
    }

    setState("loading");
    setError(null);
    setExtensionState("scanning");
    setExtensionMessage(`Opening or focusing Reddit for u/${normalisedUsername}. If Reddit asks for login or age confirmation, follow the signpost in that tab.`);

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
      setExtensionMessage(imported ? `Captured and imported u/${normalisedUsername}.` : "The extension captured data, but the app could not import it.");
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
      <section className="hero hero-compact">
        <div>
          <div className="eyebrow">PaidPolitely v0.2.3</div>
          <h1>Reddit profile scan in one browser click.</h1>
          <p>
            Extension-first analytics for creator accounts. Open Reddit in the user&apos;s browser, capture public post metadata,
            clean noisy rows, and turn it into subreddit and content signals.
          </p>
        </div>
        <div className="trust-card">
          <strong>No Reddit secrets touched.</strong>
          <span>No password, cookies, OAuth token, session token, DMs, or account settings.</span>
        </div>
      </section>

      {state === "error" ? <div className="error-card">{error}</div> : null}

      <ScanSetupCard
        username={username}
        setUsername={setUsername}
        extensionState={extensionState}
        extensionMessage={extensionMessage}
        extensionVersion={extensionVersion}
        hasData={Boolean(data)}
        loading={state === "loading"}
        onCheck={checkExtension}
        onScan={scanWithExtension}
        onTryPublicJson={analysePublicJson}
      />

      <ManualImportCard
        importPayload={importPayload}
        setImportPayload={setImportPayload}
        onImport={analyseImport}
        loading={state === "loading"}
      />

      {!data ? <EmptyState /> : <Dashboard data={data} />}
    </main>
  );
}
