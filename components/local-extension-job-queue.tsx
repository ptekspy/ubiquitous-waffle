"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { claimBrowserCrawlerJob, importBrowserCrawlerPayload, importBrowserPayload } from "@/lib/api/client";
import { sendExtensionMessage } from "@/lib/extension/client";
import type { ExtensionScanResponse, ExtensionState } from "@/lib/extension/types";
import type { AnalyzeResponse } from "@/lib/types";
import { cardClass, mutedClass } from "@/lib/ui/styles";
import { isValidRedditUsername } from "@/utils/is-valid-reddit-username";
import { normaliseRedditUsername } from "@/utils/normalise-reddit-username";

type LocalExtensionJobQueueProps = {
  username: string;
  extensionState: ExtensionState;
  scanId: string | null;
  onImported: (data: AnalyzeResponse) => void;
  onRefresh: () => Promise<void>;
  onStatus: (message: string) => void;
};

type ExtensionCrawlerResponse =
  | { ok: true; status: string; payload: unknown }
  | { ok: false; status?: string; error: string };

type JobKey = "profile" | "deepDive";
type JobStatus = "waiting" | "running" | "success" | "error";

type JobView = {
  key: JobKey;
  title: string;
  cadenceMs: number;
  nextRunAt: number;
  lastRunAt: number | null;
  status: JobStatus;
  detail: string;
  lastDurationMs?: number | null;
};

const PROFILE_INTERVAL_MS = 15 * 60 * 1000;
const DEEP_DIVE_INTERVAL_MS = 2 * 60 * 60 * 1000;
const TICK_MS = 1000;
const DEEP_DIVE_BATCH_SIZE = 8;
const STORAGE_PREFIX = "paidpolitely-local-extension-job";

function envInterval(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function profileIntervalMs(): number {
  return envInterval(process.env.NEXT_PUBLIC_PROFILE_SCAN_INTERVAL_MS, PROFILE_INTERVAL_MS);
}

function deepDiveIntervalMs(): number {
  return envInterval(process.env.NEXT_PUBLIC_DEEP_DIVE_REFRESH_INTERVAL_MS, DEEP_DIVE_INTERVAL_MS);
}

function storageKey(username: string, key: JobKey): string {
  return `${STORAGE_PREFIX}:${username.toLowerCase()}:${key}`;
}

function readLastRun(username: string, key: JobKey): number | null {
  const raw = window.localStorage.getItem(storageKey(username, key));
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function writeLastRun(username: string, key: JobKey, value: number): void {
  window.localStorage.setItem(storageKey(username, key), String(value));
}

function nextRunAt(lastRunAt: number | null, cadenceMs: number): number {
  return lastRunAt ? lastRunAt + cadenceMs : Date.now();
}

function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms <= 0) return "now";
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function initialJobs(username: string): JobView[] {
  const profileLast = readLastRun(username, "profile");
  const deepLast = readLastRun(username, "deepDive");
  const profileCadence = profileIntervalMs();
  const deepCadence = deepDiveIntervalMs();

  return [
    {
      key: "profile",
      title: "Profile scan",
      cadenceMs: profileCadence,
      nextRunAt: nextRunAt(profileLast, profileCadence),
      lastRunAt: profileLast,
      status: "waiting",
      detail: "Uses the browser extension and your Reddit browser session.",
      lastDurationMs: null,
    },
    {
      key: "deepDive",
      title: "Post deep dive",
      cadenceMs: deepCadence,
      nextRunAt: nextRunAt(deepLast, deepCadence),
      lastRunAt: deepLast,
      status: "waiting",
      detail: "Refreshes post scores, comment counts, replies, and thread comments through the extension.",
      lastDurationMs: null,
    },
  ];
}

function statusClass(status: JobStatus): string {
  if (status === "running") return "status-pill status-panel--wait";
  if (status === "success") return "status-pill status-panel--ok";
  if (status === "error") return "status-pill status-panel--off";
  return "status-pill";
}

export function LocalExtensionJobQueue({ username, extensionState, scanId, onImported, onRefresh, onStatus }: LocalExtensionJobQueueProps) {
  const normalisedUsername = normaliseRedditUsername(username);
  const isReady = extensionState === "installed" && isValidRedditUsername(normalisedUsername);
  const [now, setNow] = useState(Date.now());
  const [jobs, setJobs] = useState<JobView[]>(() => (normalisedUsername ? initialJobs(normalisedUsername) : []));
  const runningRef = useRef<JobKey | null>(null);
  const usernameRef = useRef(normalisedUsername);
  const refreshRef = useRef(onRefresh);
  const importedRef = useRef(onImported);
  const statusRef = useRef(onStatus);

  useEffect(() => {
    usernameRef.current = normalisedUsername;
    refreshRef.current = onRefresh;
    importedRef.current = onImported;
    statusRef.current = onStatus;
  }, [normalisedUsername, onImported, onRefresh, onStatus]);

  useEffect(() => {
    if (!normalisedUsername) return;
    setJobs(initialJobs(normalisedUsername));
  }, [normalisedUsername]);

  function updateJob(key: JobKey, patch: Partial<JobView>) {
    setJobs((current) => current.map((job) => (job.key === key ? { ...job, ...patch } : job)));
  }

  function markDone(key: JobKey, detail: string, startedAt: number) {
    const usernameValue = usernameRef.current;
    const cadence = key === "profile" ? profileIntervalMs() : deepDiveIntervalMs();
    const completedAt = Date.now();
    writeLastRun(usernameValue, key, completedAt);
    updateJob(key, {
      status: "success",
      detail,
      lastRunAt: completedAt,
      nextRunAt: completedAt + cadence,
      lastDurationMs: completedAt - startedAt,
    });
  }

  async function runProfileJob() {
    const usernameValue = usernameRef.current;
    if (!usernameValue || !isValidRedditUsername(usernameValue)) return;

    const startedAt = Date.now();
    runningRef.current = "profile";
    updateJob("profile", { status: "running", detail: `Scanning u/${usernameValue} through PaidPolitely Capture.` });
    statusRef.current(`Running profile scan for u/${usernameValue} through the extension.`);

    try {
      const response = await sendExtensionMessage<ExtensionScanResponse>({
        type: "PAIDPOLITELY_SCAN_REDDIT_PROFILE",
        username: usernameValue,
        preferHeadless: true,
        openInBackground: true,
      });

      if (!response.ok) {
        updateJob("profile", { status: "error", detail: response.error, lastDurationMs: Date.now() - startedAt });
        statusRef.current(response.error);
        return;
      }

      const imported = await importBrowserPayload(JSON.stringify(response.payload), {
        enqueueDeepDiveJobs: false,
        enqueuePlannerJob: false,
      });

      if (!imported.ok) {
        updateJob("profile", { status: "error", detail: imported.error, lastDurationMs: Date.now() - startedAt });
        statusRef.current(imported.error);
        return;
      }

      importedRef.current(imported.data);
      markDone("profile", `Saved profile metric point for u/${imported.data.profile.username}.`, startedAt);
      statusRef.current(`Saved scheduled profile metric point for u/${imported.data.profile.username}.`);
    } finally {
      runningRef.current = null;
    }
  }

  async function runDeepDiveJob() {
    if (!scanId) {
      updateJob("deepDive", { status: "waiting", detail: "Waiting for a saved scan before deep dives can run." });
      return;
    }

    const startedAt = Date.now();
    runningRef.current = "deepDive";
    updateJob("deepDive", { status: "running", detail: "Claiming due post deep-dive jobs." });
    statusRef.current("Running extension-backed post deep-dive batch.");

    let completed = 0;

    try {
      for (let index = 0; index < DEEP_DIVE_BATCH_SIZE; index += 1) {
        const claim = await claimBrowserCrawlerJob();
        if (!claim.ok) {
          updateJob("deepDive", { status: "error", detail: claim.error, lastDurationMs: Date.now() - startedAt });
          statusRef.current(claim.error);
          return;
        }

        if (!claim.job) break;

        updateJob("deepDive", { status: "running", detail: `Deep crawling r/${claim.job.subreddit}: ${claim.job.title.slice(0, 80)}` });
        statusRef.current(`Deep crawling r/${claim.job.subreddit}: ${claim.job.title.slice(0, 80)}`);

        const response = await sendExtensionMessage<ExtensionCrawlerResponse>({
          type: "PAIDPOLITELY_DEEP_DIVE_REDDIT_POST",
          redditId: claim.job.redditId,
        } as never);

        if (!response.ok) {
          updateJob("deepDive", { status: "error", detail: response.error, lastDurationMs: Date.now() - startedAt });
          statusRef.current(response.error);
          return;
        }

        const imported = await importBrowserCrawlerPayload(claim.job.id, response.payload);
        if (!imported.ok) {
          updateJob("deepDive", { status: "error", detail: imported.error, lastDurationMs: Date.now() - startedAt });
          statusRef.current(imported.error);
          return;
        }

        completed += 1;
      }

      if (completed > 0) await refreshRef.current();
      markDone("deepDive", completed > 0 ? `Deep crawled ${completed} post${completed === 1 ? "" : "s"}.` : "No post deep dives were due.", startedAt);
      statusRef.current(completed > 0 ? `Deep crawled ${completed} post${completed === 1 ? "" : "s"}.` : "No post deep dives were due.");
    } finally {
      runningRef.current = null;
    }
  }

  function runNow(key: JobKey) {
    if (!isReady || runningRef.current) return;
    updateJob(key, { nextRunAt: Date.now(), status: "waiting", detail: key === "profile" ? "Manual profile scan requested." : "Manual deep-dive batch requested." });
    setNow(Date.now());
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isReady || runningRef.current) return;
    const due = jobs.find((job) => job.nextRunAt <= now && (job.key !== "deepDive" || Boolean(scanId)));
    if (!due) return;

    if (due.key === "profile") void runProfileJob();
    if (due.key === "deepDive") void runDeepDiveJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, jobs, now, scanId]);

  const activeJob = jobs.find((job) => job.status === "running") ?? null;
  const nextJob = useMemo(() => [...jobs].sort((a, b) => a.nextRunAt - b.nextRunAt)[0] ?? null, [jobs]);

  if (!normalisedUsername) return null;

  return (
    <section className={`${cardClass} mb-4 p-5`}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="ui-eyebrow">Local extension queue</span>
          <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Scheduled browser jobs</h2>
          <p className={mutedClass}>Local only. The extension handles Reddit-facing work using this browser session.</p>
        </div>
        <span className={isReady ? "status-pill status-panel--ok" : "status-pill status-panel--off"}>{isReady ? "Extension ready" : "Extension needed"}</span>
      </div>

      <div className="mb-4 rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
        {activeJob ? (
          <p className="m-0 font-extrabold text-[var(--text)]">Currently running: {activeJob.title}</p>
        ) : nextJob ? (
          <p className="m-0 font-extrabold text-[var(--text)]">Next job: {nextJob.title} in {duration(nextJob.nextRunAt - now)}</p>
        ) : (
          <p className="m-0 font-extrabold text-[var(--text)]">No local jobs scheduled.</p>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {jobs.map((job) => (
          <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4" key={job.key}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <strong className="block text-[var(--text)]">{job.title}</strong>
                <small className="text-[var(--text-muted)]">Every {duration(job.cadenceMs)}</small>
              </div>
              <span className={statusClass(job.status)}>{job.status}</span>
            </div>
            <p className="mb-3 text-sm leading-relaxed text-[var(--text-muted)]">{job.detail}</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-bold text-[var(--text)]">
                <span>Next: {job.status === "running" ? "running now" : duration(job.nextRunAt - now)}</span>
                <span className="ml-3 text-[var(--text-muted)]">Last duration: {duration(job.lastDurationMs)}</span>
              </div>
              <button
                className="rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm font-extrabold text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                disabled={!isReady || Boolean(runningRef.current) || (job.key === "deepDive" && !scanId)}
                onClick={() => runNow(job.key)}
              >
                Run now
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
