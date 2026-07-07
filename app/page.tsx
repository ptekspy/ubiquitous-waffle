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

const cardClass = "rounded-[28px] border border-white/12 bg-white/[0.07] shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-[18px]";
const eyebrowClass = "text-xs font-extrabold uppercase tracking-[0.16em] text-[#ffb86b]";
const primaryButtonClass = "min-h-11 rounded-2xl border-0 bg-linear-to-br from-[#ff4f91] to-[#ffb86b] px-5 font-black text-[#1c0b14] transition disabled:cursor-not-allowed disabled:grayscale disabled:opacity-60";
const inputClass = "w-full min-w-0 rounded-2xl border border-white/12 bg-black/25 px-4 py-4 text-[#fff8fb] outline-none transition focus:border-[#ff4f91]";
const mutedClass = "text-[#c9adbd]";

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

function bridgeStateClass(state: ExtensionState): string {
  if (state === "installed") return "border-[#7affbc]/30 bg-[#7affbc]/7";
  if (state === "checking" || state === "scanning") return "border-[#ffb86b]/35 bg-[#ffb86b]/8";
  return "border-[#ff7878]/35 bg-[#ff7878]/8";
}

function bridgeDotClass(state: ExtensionState): string {
  if (state === "installed") return "bg-[#7affbc] shadow-[0_0_0_7px_rgba(122,255,188,0.12)]";
  if (state === "checking" || state === "scanning") return "bg-[#ffb86b] shadow-[0_0_0_7px_rgba(255,184,107,0.12)]";
  return "bg-[#ff7878] shadow-[0_0_0_7px_rgba(255,120,120,0.12)]";
}

function stepClass(state: StepState): string {
  if (state === "done") return "border-[#7affbc]/30 bg-[#7affbc]/7";
  if (state === "active") return "border-[#ffb86b]/35 bg-[#ffb86b]/8";
  if (state === "error") return "border-[#ff7878]/35 bg-[#ff7878]/8";
  return "border-white/12 bg-white/[0.045]";
}

function stepBadgeClass(state: StepState): string {
  if (state === "done") return "bg-[#7affbc]/18 text-[#caffdf]";
  if (state === "active") return "bg-[#ffb86b]/18 text-[#ffe7c9]";
  if (state === "error") return "bg-[#ff7878]/18 text-[#ffd1d1]";
  return "bg-white/8 text-[#c9adbd]";
}

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className={`${cardClass} p-4.5`}>
      <span className="block text-sm text-[#c9adbd]">{label}</span>
      <strong className="my-2 block text-[clamp(1.35rem,3vw,2rem)] font-black tracking-[-0.04em]">{value}</strong>
      {detail ? <small className="text-[#c9adbd]">{detail}</small> : null}
    </article>
  );
}

function JourneyStep({ number, title, body, state }: { number: number; title: string; body: string; state: StepState }) {
  return (
    <li className={`grid grid-cols-[42px_minmax(0,1fr)] items-center gap-3 rounded-[20px] border p-3 ${stepClass(state)}`}>
      <span className={`grid size-9 place-items-center rounded-full font-black ${stepBadgeClass(state)}`}>{state === "done" ? "✓" : number}</span>
      <div>
        <strong className="block">{title}</strong>
        <small className="mt-1 block leading-snug text-[#c9adbd]">{body}</small>
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <section className={`${cardClass} mb-5 p-6.5`}>
      <span className={eyebrowClass}>Waiting for first scan</span>
      <h2 className="my-2 text-xl font-black tracking-[-0.03em]">Run the extension scan to build the dashboard.</h2>
      <p className={`${mutedClass} max-w-3xl leading-relaxed`}>
        The extension uses the normal Reddit tab in your browser, then imports only the visible public post metadata into this
        page. No passwords, cookies, OAuth tokens, session tokens, or private messages are read.
      </p>
    </section>
  );
}

function WarningCard({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <section className="rounded-3xl border border-[#ffb86b]/40 bg-[#ffb86b]/10 p-4.5">
      <strong className="mb-2 block text-[#ffb86b]">Import notes</strong>
      <ul className="grid gap-1.5 pl-5 text-[#ffe7c9]">
        {warnings.map((warning) => (
          <li className="list-disc" key={warning}>{warning}</li>
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
    <section className={`${cardClass} mb-4.5 grid gap-5.5 p-5.5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,390px)]`}>
      <div>
        <span className={eyebrowClass}>Recommended flow</span>
        <h2 className="my-2.5 text-[clamp(1.8rem,4vw,3rem)] leading-none font-black tracking-[-0.05em]">Scan a Reddit profile with the browser extension.</h2>
        <p className={`${mutedClass} mb-4.5 max-w-3xl leading-relaxed`}>
          PaidPolitely opens or focuses the Reddit profile, checks it is visible, captures the public post rows, removes Reddit
          promo/game cards, and builds the report here.
        </p>
        <div className={`grid items-center gap-3 rounded-[22px] border p-3.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${bridgeStateClass(extensionState)}`}>
          <span className={`size-3.5 rounded-full ${bridgeDotClass(extensionState)}`} />
          <div>
            <strong className="block">{extensionLabel(extensionState, extensionVersion)}</strong>
            <small className="mt-1 block leading-snug text-[#c9adbd]">{extensionMessage}</small>
          </div>
          <button className={`${primaryButtonClass} min-h-10 px-3.5`} type="button" onClick={onCheck} disabled={extensionState === "checking" || extensionState === "scanning"}>
            {extensionState === "checking" ? "Checking..." : "Recheck"}
          </button>
        </div>
      </div>

      <ol className="grid content-start gap-2.5 p-0">
        <JourneyStep number={1} title="Extension" body="Detect PaidPolitely Capture in this browser." state={extensionStepState} />
        <JourneyStep number={2} title="Username" body="Paste a username, profile URL, or u/name." state={usernameStepState} />
        <JourneyStep number={3} title="Capture" body="Open Reddit, scroll the profile, and import metadata." state={captureStepState} />
        <JourneyStep number={4} title="Review" body="Read the subreddit, timing, and content signals." state={reviewStepState} />
      </ol>

      <form className="rounded-3xl border border-white/12 bg-black/15 p-4 lg:col-span-2" onSubmit={submit}>
        <label className="mb-2 block text-sm font-extrabold text-[#c9adbd]" htmlFor="username">Reddit profile</label>
        <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            className={inputClass}
            id="username"
            name="username"
            placeholder="u/MrMrsHK or reddit.com/user/MrMrsHK"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
          />
          <button className={primaryButtonClass} disabled={!canScan} type="submit">
            {extensionState === "scanning" || loading ? "Scanning..." : normalisedUsername ? `Scan u/${normalisedUsername}` : "Scan profile"}
          </button>
        </div>
        <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <small className="text-[#c9adbd]">{extensionReady ? "Extension ready. Reddit will open in a tab if needed." : "Install or reload the extension, then recheck."}</small>
          <button className="border-0 bg-transparent p-0 font-extrabold text-[#ffe6f0] underline decoration-white/25 underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60" type="button" onClick={onTryPublicJson} disabled={!hasValidUsername || loading}>
            Try server-side JSON instead
          </button>
        </div>
        {EXTENSION_STORE_URL ? (
          <a className={`${primaryButtonClass} mt-3 inline-flex w-fit items-center justify-center no-underline`} href={EXTENSION_STORE_URL} target="_blank" rel="noreferrer">
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
    <details className={`${cardClass} mb-4.5 overflow-hidden`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3.5 p-5 marker:hidden after:grid after:size-8.5 after:place-items-center after:rounded-full after:bg-white/8 after:text-xl after:font-black after:text-[#c9adbd] after:content-['+'] open:after:content-['−']">
        <span>
          <span className="block font-black">Manual import / debugging fallback</span>
          <small className="block text-[#c9adbd]">Use this only if the extension bridge fails.</small>
        </span>
      </summary>
      <div className="grid gap-3.5 border-t border-white/12 p-5">
        <p className={`${mutedClass} leading-relaxed`}>
          Open the Reddit profile, paste the robust capture snippet into DevTools, let it scroll, then paste the copied JSON here.
          The importer will still clean duplicates, game cards, and comment-link rows.
        </p>
        <div className="flex flex-wrap gap-3">
          <button className={primaryButtonClass} type="button" onClick={copySnippet}>
            {copied ? "Snippet copied" : "Copy robust capture snippet"}
          </button>
        </div>
        <textarea
          className={`${inputClass} min-h-38 resize-y font-mono text-sm leading-relaxed`}
          value={importPayload}
          onChange={(event) => setImportPayload(event.target.value)}
          placeholder='Paste { "source": "paidpolitely-reddit-extension-capture-v2", ... } or browser-import JSON here'
        />
        <button className={`${primaryButtonClass} justify-self-start`} type="button" onClick={onImport} disabled={loading || importPayload.trim().length === 0}>
          {loading ? "Importing..." : "Analyse pasted JSON"}
        </button>
      </div>
    </details>
  );
}

function SubredditTable({ rows }: { rows: SubredditMetric[] }) {
  if (rows.length === 0) return <p className={mutedClass}>No subreddit data found yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-155 border-collapse">
        <thead>
          <tr>
            <th className="border-b border-white/12 px-2.5 py-3 text-left text-xs font-extrabold tracking-widest text-[#c9adbd] uppercase">Subreddit</th>
            <th className="border-b border-white/12 px-2.5 py-3 text-left text-xs font-extrabold tracking-widest text-[#c9adbd] uppercase">Posts</th>
            <th className="border-b border-white/12 px-2.5 py-3 text-left text-xs font-extrabold tracking-widest text-[#c9adbd] uppercase">Comments</th>
            <th className="border-b border-white/12 px-2.5 py-3 text-left text-xs font-extrabold tracking-widest text-[#c9adbd] uppercase">Total score</th>
            <th className="border-b border-white/12 px-2.5 py-3 text-left text-xs font-extrabold tracking-widest text-[#c9adbd] uppercase">Avg post</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.subreddit}>
              <td className="border-b border-white/12 px-2.5 py-3">r/{row.subreddit}</td>
              <td className="border-b border-white/12 px-2.5 py-3">{row.posts}</td>
              <td className="border-b border-white/12 px-2.5 py-3">{row.comments}</td>
              <td className="border-b border-white/12 px-2.5 py-3">{numberFormat(row.totalScore)}</td>
              <td className="border-b border-white/12 px-2.5 py-3">{row.averagePostScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContentTypeList({ rows }: { rows: ContentTypeMetric[] }) {
  if (rows.length === 0) return <p className={mutedClass}>No public post formats found yet.</p>;

  return (
    <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
      {rows.map((row) => (
        <div className="rounded-2xl border border-white/12 bg-white/5 p-3.5" key={row.type}>
          <strong className="mb-2 block text-lg capitalize">{row.type}</strong>
          <span className="block text-sm text-[#c9adbd]">{row.posts} posts</span>
          <small className="block text-sm text-[#c9adbd]">{row.averageScore} avg score</small>
        </div>
      ))}
    </div>
  );
}

function Timeline({ rows }: { rows: TimelinePoint[] }) {
  const maxScore = useMemo(() => Math.max(...rows.map((row) => row.score), 1), [rows]);

  if (rows.length === 0) return <p className={mutedClass}>No recent activity timeline found.</p>;

  return (
    <div className="grid gap-2.5" aria-label="Recent activity timeline">
      {rows.map((row) => (
        <div className="grid grid-cols-[56px_minmax(0,1fr)_64px] items-center gap-3" key={row.date}>
          <span className="text-sm text-[#c9adbd]">{row.date.slice(5)}</span>
          <div className="h-3 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-linear-to-r from-[#ff4f91] to-[#ffb86b]" style={{ width: `${Math.max(6, (row.score / maxScore) * 100)}%` }} />
          </div>
          <strong className="text-sm text-[#c9adbd]">{compactNumber(row.score)}</strong>
        </div>
      ))}
    </div>
  );
}

function PanelHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <span className={eyebrowClass}>{eyebrow}</span>
      <h2 className="mt-2 mb-0 text-xl font-black tracking-[-0.03em]">{title}</h2>
    </div>
  );
}

function Dashboard({ data }: { data: AnalyzeResponse }) {
  return (
    <section className="grid gap-5.5">
      <WarningCard warnings={data.warnings} />

      <div className={`${cardClass} flex items-center justify-between gap-5 p-6.5 max-sm:flex-col max-sm:items-stretch`}>
        <div>
          <span className={eyebrowClass}>Latest scan</span>
          <h2 className="my-2 text-[clamp(2rem,4vw,3.2rem)] font-black tracking-[-0.05em]">u/{data.profile.username}</h2>
          <p className={mutedClass}>Profile created {formatDate(data.profile.createdUtc)}</p>
        </div>
        <div className="min-w-47 rounded-3xl bg-linear-to-br from-[#ff4f91]/22 to-[#ffb86b]/22 p-4.5 text-right max-sm:text-left">
          <span className="block text-sm text-[#c9adbd]">Total karma</span>
          <strong className="mt-1 block text-3xl font-black">{numberFormat(data.profile.totalKarma)}</strong>
        </div>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-6">
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

      <section className={`${cardClass} bg-linear-to-br from-[#ff4f91]/16 to-[#ffb86b]/10 p-6`}>
        <PanelHeading eyebrow="Actionable readout" title="Next moves" />
        {data.analytics.recommendations.length === 0 ? (
          <p className={mutedClass}>Not enough public data for recommendations yet.</p>
        ) : (
          <ul className="grid gap-2.5 pl-5 leading-relaxed text-[#ffe6f0]">
            {data.analytics.recommendations.map((recommendation) => (
              <li className="list-disc" key={recommendation}>{recommendation}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3.5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <article className={`${cardClass} overflow-hidden p-6`}>
          <PanelHeading eyebrow="Where it works" title="Subreddit performance" />
          <SubredditTable rows={data.analytics.subreddits} />
        </article>
        <article className={`${cardClass} overflow-hidden p-6`}>
          <PanelHeading eyebrow="Format signal" title="Content formats" />
          <ContentTypeList rows={data.analytics.contentTypes} />
        </article>
      </section>

      <section className={`${cardClass} overflow-hidden p-6`}>
        <PanelHeading eyebrow="Momentum" title="Recent activity score" />
        <Timeline rows={data.analytics.timeline} />
      </section>

      <section className="grid gap-3.5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <article className={`${cardClass} overflow-hidden p-6`}>
          <PanelHeading eyebrow="Repeat patterns" title="Top posts" />
          <div className="grid gap-3">
            {data.analytics.topPosts.map((post) => (
              <a className="block rounded-2xl border border-white/12 bg-white/5 p-3.5 no-underline transition hover:border-[#ff4f91]/55" href={post.permalink} target="_blank" rel="noreferrer" key={post.id}>
                <strong className="mb-1.5 block leading-snug">{post.title}</strong>
                <span className="block text-sm text-[#c9adbd]">r/{post.subreddit} · {numberFormat(post.score)} score · {post.numComments} comments</span>
              </a>
            ))}
          </div>
        </article>
        <article className={`${cardClass} overflow-hidden p-6`}>
          <PanelHeading eyebrow="Conversation signal" title="Top comments" />
          {data.analytics.topComments.length === 0 ? (
            <p className={mutedClass}>No comments were captured in this browser import.</p>
          ) : (
            <div className="grid gap-3">
              {data.analytics.topComments.map((comment) => (
                <a className="block rounded-2xl border border-white/12 bg-white/5 p-3.5 no-underline transition hover:border-[#ff4f91]/55" href={comment.permalink} target="_blank" rel="noreferrer" key={comment.id}>
                  <strong className="mb-1.5 block leading-snug">{comment.linkTitle ?? `Comment in r/${comment.subreddit}`}</strong>
                  <span className="block text-sm text-[#c9adbd]">r/{comment.subreddit} · {numberFormat(comment.score)} score</span>
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
    <main className="min-h-screen bg-[#120b16] bg-[radial-gradient(circle_at_top_left,rgba(255,79,145,0.28),transparent_36rem),radial-gradient(circle_at_top_right,rgba(255,184,107,0.18),transparent_34rem),linear-gradient(180deg,rgba(255,255,255,0.025),transparent_26rem)] px-4 py-10 text-[#fff8fb] sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1180px]">
        <section className="mb-5.5 grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
          <div>
            <div className={eyebrowClass}>PaidPolitely v0.2.3</div>
            <h1 className="mt-0 mb-4.5 max-w-3xl text-[clamp(2.4rem,6vw,5rem)] leading-[0.94] font-black tracking-[-0.07em]">Reddit profile scan in one browser click.</h1>
            <p className="max-w-3xl text-lg leading-relaxed text-[#c9adbd]">
              Extension-first analytics for creator accounts. Open Reddit in the user&apos;s browser, capture public post metadata,
              clean noisy rows, and turn it into subreddit and content signals.
            </p>
          </div>
          <div className={`${cardClass} bg-linear-to-br from-[#7affbc]/11 to-white/[0.055] p-4.5`}>
            <strong className="mb-2 block text-[#d9ffe9]">No Reddit secrets touched.</strong>
            <span className="block leading-snug text-[#c9adbd]">No password, cookies, OAuth token, session token, DMs, or account settings.</span>
          </div>
        </section>

        {state === "error" ? <div className={`${cardClass} mb-4.5 border-[#ff7878]/50 p-6.5 text-[#ff7878]`}>{error}</div> : null}

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
      </div>
    </main>
  );
}
