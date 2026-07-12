"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  claimBrowserCrawlerJob,
  claimIdleCrawlerTarget,
  importBrowserCrawlerPayload,
  importBrowserPayload,
  importHistoricalSnapshotPayload,
  importIdleCrawlerPayload,
  reportIdleCrawlerFailure,
} from "@/lib/api/client";
import { sendExtensionMessage } from "@/lib/extension/client";
import type { ExtensionProfileHtmlSnapshotResponse, ExtensionScanResponse, ExtensionState } from "@/lib/extension/types";
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

type QueueSettings = {
  profileScanInterval: number;
  deepDiveInterval: number;
  deepDiveBatchSize: number;
  idleCrawlInterval: number;
  idleCrawlBatchSize: number;
};

type JobKey = "profile" | "deepDive" | "idleCrawl";
type JobStatus = "waiting" | "running" | "success" | "error" | "stopped";

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

const DEFAULT_PROFILE_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_DEEP_DIVE_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_DEEP_DIVE_BATCH_SIZE = 500;
const DEFAULT_IDLE_CRAWL_INTERVAL_MS = 30 * 1000;
const DEFAULT_IDLE_CRAWL_BATCH_SIZE = 3;
const MAX_DEEP_DIVE_RUN_ALL = 500;
const MAX_IDLE_CRAWL_RUN_ALL = 25;
const TICK_MS = 1000;
const STORAGE_PREFIX = "paidpolitely-local-extension-job";
const AUTOMATION_STORAGE_SUFFIX = "automation-enabled";
const IDLE_CRAWLER_STORAGE_SUFFIX = "idle-crawler-enabled";
const HISTORICAL_SNAPSHOT_STORAGE_SUFFIX = "historical-snapshot-hour";
const MIN_ERROR_RETRY_MS = 60 * 1000;
const MAX_ERROR_RETRY_MS = 5 * 60 * 1000;
const PROFILE_HTML_SNAPSHOT_TIMEOUT_MS = 12 * 60 * 1000;

function envInterval(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultSettings(): QueueSettings {
  return {
    profileScanInterval: envInterval(process.env.NEXT_PUBLIC_PROFILE_SCAN_INTERVAL_MS, DEFAULT_PROFILE_INTERVAL_MS),
    deepDiveInterval: envInterval(process.env.NEXT_PUBLIC_DEEP_DIVE_REFRESH_INTERVAL_MS, DEFAULT_DEEP_DIVE_INTERVAL_MS),
    deepDiveBatchSize: DEFAULT_DEEP_DIVE_BATCH_SIZE,
    idleCrawlInterval: envInterval(process.env.NEXT_PUBLIC_IDLE_CRAWL_INTERVAL_MS, DEFAULT_IDLE_CRAWL_INTERVAL_MS),
    idleCrawlBatchSize: envInterval(process.env.NEXT_PUBLIC_IDLE_CRAWL_BATCH_SIZE, DEFAULT_IDLE_CRAWL_BATCH_SIZE),
  };
}

async function fetchQueueSettings(): Promise<QueueSettings> {
  const fallback = defaultSettings();
  const response = await fetch(`/api/product/ops?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) return fallback;
  const payload = await response.json();
  const settings = payload?.settings ?? {};
  return {
    profileScanInterval: envInterval(String(settings.profileScanInterval ?? ""), fallback.profileScanInterval),
    deepDiveInterval: envInterval(String(settings.deepDiveInterval ?? ""), fallback.deepDiveInterval),
    deepDiveBatchSize: envInterval(String(settings.deepDiveBatchSize ?? ""), fallback.deepDiveBatchSize),
    idleCrawlInterval: fallback.idleCrawlInterval,
    idleCrawlBatchSize: fallback.idleCrawlBatchSize,
  };
}

function storageKey(username: string, key: JobKey): string {
  return `${STORAGE_PREFIX}:${username.toLowerCase()}:${key}`;
}

function automationStorageKey(username: string): string {
  return `${STORAGE_PREFIX}:${username.toLowerCase()}:${AUTOMATION_STORAGE_SUFFIX}`;
}

function idleCrawlerStorageKey(username: string): string {
  return `${STORAGE_PREFIX}:${username.toLowerCase()}:${IDLE_CRAWLER_STORAGE_SUFFIX}`;
}

function historicalSnapshotStorageKey(username: string): string {
  return `${STORAGE_PREFIX}:${username.toLowerCase()}:${HISTORICAL_SNAPSHOT_STORAGE_SUFFIX}`;
}

function readAutomationEnabled(username: string): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(automationStorageKey(username)) !== "false";
}

function writeAutomationEnabled(username: string, enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(automationStorageKey(username), enabled ? "true" : "false");
}

function readIdleCrawlerEnabled(username: string): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(idleCrawlerStorageKey(username)) !== "false";
}

function writeIdleCrawlerEnabled(username: string, enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(idleCrawlerStorageKey(username), enabled ? "true" : "false");
}

function londonParts(date: Date): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function historicalHourKey(date = new Date()): string {
  const parts = londonParts(date);
  return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}`;
}

function historicalSourceFileName(capturedAt: string): string {
  const parts = londonParts(new Date(capturedAt));
  return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}-${parts.minute}.html`;
}

function shouldCaptureHistoricalSnapshot(username: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(historicalSnapshotStorageKey(username)) !== historicalHourKey();
}

function markHistoricalSnapshotCaptured(username: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(historicalSnapshotStorageKey(username), historicalHourKey());
}

function readLastRun(username: string, key: JobKey): number | null {
  if (typeof window === "undefined") return null;
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

function initialJobs(username: string, settings: QueueSettings): JobView[] {
  const profileLast = readLastRun(username, "profile");
  const deepLast = readLastRun(username, "deepDive");
  const idleLast = readLastRun(username, "idleCrawl");

  return [
    {
      key: "profile",
      title: "Profile scan",
      cadenceMs: settings.profileScanInterval,
      nextRunAt: nextRunAt(profileLast, settings.profileScanInterval),
      lastRunAt: profileLast,
      status: "waiting",
      detail: "Uses the browser extension and your Reddit browser session.",
      lastDurationMs: null,
    },
    {
      key: "deepDive",
      title: "Post deep dive",
      cadenceMs: settings.deepDiveInterval,
      nextRunAt: nextRunAt(deepLast, settings.deepDiveInterval),
      lastRunAt: deepLast,
      status: "waiting",
      detail: "Refreshes post scores, comment counts, replies, and thread comments through the extension.",
      lastDurationMs: null,
    },
    {
      key: "idleCrawl",
      title: "Idle crawler",
      cadenceMs: settings.idleCrawlInterval,
      nextRunAt: nextRunAt(idleLast, settings.idleCrawlInterval),
      lastRunAt: idleLast,
      status: "waiting",
      detail: "When no priority work is due, crawls active subreddit feeds, home feeds, and collected users for more data.",
      lastDurationMs: null,
    },
  ];
}

function statusClass(status: JobStatus): string {
  if (status === "running") return "status-pill status-panel--wait";
  if (status === "success") return "status-pill status-panel--ok";
  if (status === "error") return "status-pill status-panel--off";
  if (status === "stopped") return "status-pill status-panel--off";
  return "status-pill";
}

function buttonClass(extra = ""): string {
  return `rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm font-extrabold text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50 ${extra}`.trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "Unknown error.");
}

function isInterruptedExtensionSnapshot(error: string): boolean {
  return /stopped replying|message channel closed|receiving end does not exist|extension context invalidated/i.test(error);
}

async function captureProfileHtmlSnapshot(username: string): Promise<ExtensionProfileHtmlSnapshotResponse> {
  const response = await sendExtensionMessage<ExtensionProfileHtmlSnapshotResponse>({
    type: "PAIDPOLITELY_CAPTURE_REDDIT_PROFILE_HTML",
    username,
    openInBackground: true,
  }, PROFILE_HTML_SNAPSHOT_TIMEOUT_MS);

  if (response.ok || !isInterruptedExtensionSnapshot(response.error)) return response;

  await new Promise((resolve) => window.setTimeout(resolve, 1500));
  return sendExtensionMessage<ExtensionProfileHtmlSnapshotResponse>({
    type: "PAIDPOLITELY_CAPTURE_REDDIT_PROFILE_HTML",
    username,
    openInBackground: true,
  }, PROFILE_HTML_SNAPSHOT_TIMEOUT_MS);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function payloadCounts(payload: unknown): { posts: number; comments: number } {
  if (!isRecord(payload)) return { posts: 0, comments: 0 };
  return { posts: arrayCount(payload.posts), comments: arrayCount(payload.comments) };
}

function feedLabel(feed: string): string {
  return `/${feed.replace(":", " ")}`;
}

function idleTargetLabel(target: { kind: string; label: string; feed: string; subreddit: string | null; username: string | null; forced?: boolean }): string {
  if (target.kind === "HOME_FEED") return `home ${feedLabel(target.feed)}`;
  if (target.kind === "SUBREDDIT_FEED") return `r/${target.subreddit ?? "unknown"} ${feedLabel(target.feed)}`;
  if (target.kind === "USER_PROFILE") return `u/${target.username ?? "unknown"} profile`;
  return target.label;
}

function idleTargetKindLabel(target: { kind: string }): string {
  if (target.kind === "HOME_FEED") return "home feed";
  if (target.kind === "SUBREDDIT_FEED") return "subreddit feed";
  if (target.kind === "USER_PROFILE") return "user profile";
  return "crawler target";
}

export function LocalExtensionJobQueue({ username, extensionState, scanId, onImported, onRefresh, onStatus }: LocalExtensionJobQueueProps) {
  const normalisedUsername = normaliseRedditUsername(username);
  const isReady = extensionState === "installed" && isValidRedditUsername(normalisedUsername);
  const [now, setNow] = useState(Date.now());
  const [settings, setSettings] = useState<QueueSettings>(() => defaultSettings());
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [automationEnabled, setAutomationEnabled] = useState(true);
  const [idleCrawlerEnabled, setIdleCrawlerEnabled] = useState(true);
  const runningRef = useRef<JobKey | null>(null);
  const stopRequestedRef = useRef(false);
  const usernameRef = useRef(normalisedUsername);
  const settingsRef = useRef(settings);
  const refreshRef = useRef(onRefresh);
  const importedRef = useRef(onImported);
  const statusRef = useRef(onStatus);

  useEffect(() => {
    usernameRef.current = normalisedUsername;
    settingsRef.current = settings;
    refreshRef.current = onRefresh;
    importedRef.current = onImported;
    statusRef.current = onStatus;
  }, [normalisedUsername, onImported, onRefresh, onStatus, settings]);

  useEffect(() => {
    if (!normalisedUsername) return;
    setAutomationEnabled(readAutomationEnabled(normalisedUsername));
    setIdleCrawlerEnabled(readIdleCrawlerEnabled(normalisedUsername));
    stopRequestedRef.current = false;
  }, [normalisedUsername]);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      const nextSettings = await fetchQueueSettings();
      if (cancelled) return;

      setSettings(nextSettings);
      if (!normalisedUsername) return;

      setJobs((current) => {
        const fresh = initialJobs(normalisedUsername, nextSettings);
        if (current.length === 0) return fresh;

        return fresh.map((freshJob) => {
          const existing = current.find((job) => job.key === freshJob.key);
          if (!existing) return freshJob;

          const storedLastRun = readLastRun(normalisedUsername, freshJob.key);
          const lastRunAt = existing.lastRunAt ?? storedLastRun;
          const recalculatedNext = lastRunAt ? lastRunAt + freshJob.cadenceMs : existing.nextRunAt;
          const shouldKeepRetry = existing.status === "error" && existing.nextRunAt > Date.now();

          return {
            ...existing,
            cadenceMs: freshJob.cadenceMs,
            lastRunAt,
            nextRunAt: existing.status === "running" || shouldKeepRetry ? existing.nextRunAt : recalculatedNext,
          };
        });
      });
    }

    void loadSettings();
    const timer = window.setInterval(() => void loadSettings(), 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [normalisedUsername]);

  function updateJob(key: JobKey, patch: Partial<JobView>) {
    setJobs((current) => current.map((job) => (job.key === key ? { ...job, ...patch } : job)));
  }

  function setJobDetail(key: JobKey, detail: string, broadcast = false) {
    updateJob(key, { status: "running", detail });
    if (broadcast) statusRef.current(detail);
  }

  function kickScheduler() {
    setNow((value) => Math.max(Date.now(), value + 1));
  }

  function finishRunningJob() {
    runningRef.current = null;
    kickScheduler();
  }

  function cadenceFor(key: JobKey): number {
    if (key === "profile") return settingsRef.current.profileScanInterval;
    if (key === "deepDive") return settingsRef.current.deepDiveInterval;
    return settingsRef.current.idleCrawlInterval;
  }

  function retryDelayFor(key: JobKey): number {
    const cadence = cadenceFor(key);
    if (key === "idleCrawl") return Math.min(Math.max(cadence, 30 * 1000), MIN_ERROR_RETRY_MS);
    return Math.min(Math.max(Math.floor(cadence / 5), MIN_ERROR_RETRY_MS), MAX_ERROR_RETRY_MS);
  }

  function markDone(key: JobKey, detail: string, startedAt: number) {
    const usernameValue = usernameRef.current;
    const cadence = cadenceFor(key);
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

  function markStopped(key: JobKey, detail: string, startedAt: number) {
    const usernameValue = usernameRef.current;
    const cadence = cadenceFor(key);
    const stoppedAt = Date.now();
    stopRequestedRef.current = false;
    writeLastRun(usernameValue, key, stoppedAt);
    updateJob(key, {
      status: "stopped",
      detail,
      lastRunAt: stoppedAt,
      nextRunAt: stoppedAt + cadence,
      lastDurationMs: stoppedAt - startedAt,
    });
    statusRef.current(detail);
  }

  function markFailed(key: JobKey, detail: string, startedAt: number, retryDelayMs = retryDelayFor(key)) {
    const usernameValue = usernameRef.current;
    const failedAt = Date.now();
    const retryAt = failedAt + retryDelayMs;
    writeLastRun(usernameValue, key, failedAt);
    updateJob(key, {
      status: "error",
      detail: `${detail} Retrying in ${duration(retryDelayMs)}.`,
      lastRunAt: failedAt,
      nextRunAt: retryAt,
      lastDurationMs: failedAt - startedAt,
    });
    statusRef.current(`${detail} Retrying in ${duration(retryDelayMs)}.`);
  }

  async function runProfileJob() {
    const usernameValue = usernameRef.current;
    if (!usernameValue || !isValidRedditUsername(usernameValue)) return;

    const startedAt = Date.now();
    stopRequestedRef.current = false;
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
        markFailed("profile", response.error, startedAt);
        return;
      }

      if (stopRequestedRef.current) {
        markStopped("profile", `Stopped profile scan for u/${usernameValue} before importing returned data.`, startedAt);
        return;
      }

      setJobDetail("profile", `Profile scan returned data for u/${usernameValue}; saving metric point.`);
      const imported = await importBrowserPayload(JSON.stringify(response.payload), {
        enqueueDeepDiveJobs: false,
        enqueuePlannerJob: false,
      });

      if (!imported.ok) {
        markFailed("profile", imported.error, startedAt);
        return;
      }

      importedRef.current(imported.data);
      if (stopRequestedRef.current) {
        markStopped("profile", `Stopped profile scan after saving metric point for u/${imported.data.profile.username}.`, startedAt);
        return;
      }

      let snapshotDetail = "";
      if (shouldCaptureHistoricalSnapshot(usernameValue)) {
        setJobDetail("profile", `Hourly historical snapshot is due; capturing full profile HTML for u/${usernameValue}.`);
        const snapshot = await captureProfileHtmlSnapshot(usernameValue);

        if (snapshot.ok) {
          const saved = await importHistoricalSnapshotPayload({
            username: snapshot.payload.username || usernameValue,
            content: snapshot.payload.content,
            capturedAt: snapshot.payload.capturedAt,
            sourceFileName: historicalSourceFileName(snapshot.payload.capturedAt),
          });

          if (saved.ok) {
            markHistoricalSnapshotCaptured(usernameValue);
            snapshotDetail = ` Also saved hourly HTML snapshot with ${saved.postCount} posts and ${saved.viewObservationCount ?? 0} view observations.`;
            window.dispatchEvent(new Event("paidpolitely-account-metrics-refresh"));
            window.dispatchEvent(new Event("paidpolitely-workspace-refresh"));
          } else {
            snapshotDetail = ` Hourly HTML snapshot failed: ${saved.error}`;
          }
        } else {
          snapshotDetail = ` Hourly HTML snapshot failed: ${snapshot.error}`;
        }
      }

      markDone("profile", `Saved profile metric point for u/${imported.data.profile.username}.${snapshotDetail}`, startedAt);
      statusRef.current(`Saved scheduled profile metric point for u/${imported.data.profile.username}.${snapshotDetail}`);
    } catch (error) {
      markFailed("profile", errorMessage(error), startedAt);
    } finally {
      finishRunningJob();
    }
  }

  async function runDeepDiveJob(runAllDue = false) {
    if (!scanId) {
      updateJob("deepDive", { status: "waiting", detail: "Waiting for a saved scan before deep dives can run." });
      return;
    }

    const startedAt = Date.now();
    const limit = runAllDue ? MAX_DEEP_DIVE_RUN_ALL : Math.max(1, settingsRef.current.deepDiveBatchSize);
    stopRequestedRef.current = false;
    runningRef.current = "deepDive";
    updateJob("deepDive", { status: "running", detail: runAllDue ? "Claiming every due post deep-dive job." : `Claiming up to ${limit} due post deep-dive jobs.` });
    statusRef.current(runAllDue ? "Running all due extension-backed post deep dives." : `Running extension-backed post deep-dive batch of up to ${limit}.`);

    let completed = 0;
    let exhausted = false;
    let stopped = false;

    try {
      for (let index = 0; index < limit; index += 1) {
        if (stopRequestedRef.current) {
          stopped = true;
          break;
        }

        setJobDetail("deepDive", `Checking for due post deep-dive job ${index + 1}${runAllDue ? "" : `/${limit}`}.`);
        const claim = await claimBrowserCrawlerJob();
        if (!claim.ok) {
          markFailed("deepDive", claim.error, startedAt);
          return;
        }

        if (!claim.job) {
          exhausted = true;
          break;
        }

        setJobDetail("deepDive", `Deep crawling ${completed + 1}${runAllDue ? "" : `/${limit}`} · r/${claim.job.subreddit}: ${claim.job.title.slice(0, 80)}`, true);

        const response = await sendExtensionMessage<ExtensionCrawlerResponse>({
          type: "PAIDPOLITELY_DEEP_DIVE_REDDIT_POST",
          redditId: claim.job.redditId,
        } as never);

        if (!response.ok) {
          markFailed("deepDive", response.error, startedAt);
          return;
        }

        setJobDetail("deepDive", `Saving deep-dive results for r/${claim.job.subreddit}: ${claim.job.title.slice(0, 80)}.`);
        const imported = await importBrowserCrawlerPayload(claim.job.id, response.payload);
        if (!imported.ok) {
          markFailed("deepDive", imported.error, startedAt);
          return;
        }

        completed += 1;
        if (stopRequestedRef.current) {
          stopped = true;
          break;
        }

        setJobDetail("deepDive", `Saved ${completed} deep-dive result${completed === 1 ? "" : "s"}; checking for the next due post.`);
      }

      if (completed > 0) await refreshRef.current();
      if (stopped) {
        const detail = completed > 0 ? `Stopped deep-dive crawler after safely saving ${completed} post${completed === 1 ? "" : "s"}.` : "Stopped deep-dive crawler before claiming another post.";
        markStopped("deepDive", detail, startedAt);
        return;
      }

      const suffix = runAllDue && !exhausted && completed >= MAX_DEEP_DIVE_RUN_ALL ? ` Hit the safety cap of ${MAX_DEEP_DIVE_RUN_ALL}; run again to continue.` : "";
      const detail = completed > 0 ? `Deep crawled ${completed} post${completed === 1 ? "" : "s"}.${suffix}` : "No post deep dives were due; idle crawler can use the browser next.";
      markDone("deepDive", detail, startedAt);
      statusRef.current(detail);
    } catch (error) {
      markFailed("deepDive", errorMessage(error), startedAt);
    } finally {
      finishRunningJob();
    }
  }

  async function runIdleCrawlJob(runMany = false) {
    const startedAt = Date.now();
    const limit = runMany ? MAX_IDLE_CRAWL_RUN_ALL : Math.max(1, settingsRef.current.idleCrawlBatchSize);
    stopRequestedRef.current = false;
    runningRef.current = "idleCrawl";
    updateJob("idleCrawl", { status: "running", detail: `Starting idle crawler batch. Looking for up to ${limit} target${limit === 1 ? "" : "s"}.` });
    statusRef.current(`Running idle crawler batch of up to ${limit}.`);

    let completed = 0;
    let posts = 0;
    let comments = 0;
    let users = 0;
    let stopped = false;

    try {
      for (let index = 0; index < limit; index += 1) {
        if (stopRequestedRef.current) {
          stopped = true;
          break;
        }

        setJobDetail("idleCrawl", `Claiming idle target ${index + 1}/${limit} from the server.`);
        const claim = await claimIdleCrawlerTarget();
        if (!claim.ok) {
          markFailed("idleCrawl", claim.error, startedAt);
          return;
        }

        if (!claim.target) {
          setJobDetail("idleCrawl", `No idle target returned after ${completed} completed target${completed === 1 ? "" : "s"}.`);
          break;
        }

        const targetName = idleTargetLabel(claim.target);
        const targetKind = idleTargetKindLabel(claim.target);
        const fillerText = claim.target.forced ? " as filler because no due priority target was available" : "";
        setJobDetail("idleCrawl", `Crawling ${targetKind}: ${targetName}${fillerText}. Batch item ${completed + 1}/${limit}.`, true);

        const response = await sendExtensionMessage<ExtensionCrawlerResponse>({
          type: "PAIDPOLITELY_CRAWL_REDDIT_TARGET",
          target: claim.target,
        } as never);

        if (!response.ok) {
          await reportIdleCrawlerFailure(claim.target.id, response.error);
          markFailed("idleCrawl", `${targetName} failed: ${response.error}`, startedAt);
          return;
        }

        const returned = payloadCounts(response.payload);
        setJobDetail("idleCrawl", `Extension finished ${targetName}. Importing ${returned.posts} post${returned.posts === 1 ? "" : "s"} and ${returned.comments} comment${returned.comments === 1 ? "" : "s"}.`);
        const imported = await importIdleCrawlerPayload(claim.target.id, response.payload);
        if (!imported.ok) {
          await reportIdleCrawlerFailure(claim.target.id, imported.error);
          markFailed("idleCrawl", `${targetName} import failed: ${imported.error}`, startedAt);
          return;
        }

        completed += 1;
        posts += imported.posts ?? 0;
        comments += imported.comments ?? 0;
        users += imported.users ?? 0;
        if (stopRequestedRef.current) {
          stopped = true;
          break;
        }

        setJobDetail("idleCrawl", `Saved ${targetName}: ${imported.posts ?? 0} posts, ${imported.comments ?? 0} comments, ${imported.users ?? 0} users. Batch total: ${posts} posts, ${comments} comments, ${users} users.`);
      }

      if (completed > 0) window.dispatchEvent(new Event("paidpolitely-idle-crawler-refresh"));
      if (stopped) {
        const detail = completed > 0 ? `Stopped idle crawler after safely saving ${completed} target${completed === 1 ? "" : "s"}; totals: ${posts} posts, ${comments} comments, ${users} users.` : "Stopped idle crawler before claiming another target.";
        markStopped("idleCrawl", detail, startedAt);
        return;
      }

      const detail = completed > 0 ? `Idle crawled ${completed} target${completed === 1 ? "" : "s"}; saved ${posts} posts, ${comments} comments, and ${users} users.` : "No idle crawl targets were available.";
      markDone("idleCrawl", detail, startedAt);
      statusRef.current(detail);
      window.dispatchEvent(new Event("paidpolitely-idle-crawler-refresh"));
    } catch (error) {
      markFailed("idleCrawl", errorMessage(error), startedAt);
    } finally {
      finishRunningJob();
    }
  }

  function runNow(key: JobKey) {
    if (!isReady || runningRef.current) return;
    if (key === "profile") void runProfileJob();
    if (key === "deepDive") void runDeepDiveJob(false);
    if (key === "idleCrawl") void runIdleCrawlJob(false);
  }

  function runAllDueDeepDives() {
    if (!isReady || runningRef.current || !scanId) return;
    void runDeepDiveJob(true);
  }

  function runIdleSweep() {
    if (!isReady || runningRef.current) return;
    void runIdleCrawlJob(true);
  }

  function stopCurrentJob() {
    const activeKey = runningRef.current;
    if (!activeKey) return;
    stopRequestedRef.current = true;
    const detail = "Stop requested. Finishing the current browser action safely, then this job will stop before the next target.";
    updateJob(activeKey, { detail });
    statusRef.current(detail);
  }

  function toggleAutomation() {
    if (!normalisedUsername) return;
    setAutomationEnabled((current) => {
      const next = !current;
      writeAutomationEnabled(normalisedUsername, next);

      if (!next) {
        stopRequestedRef.current = true;
        const detail = runningRef.current ? "Automation paused. Current job will stop after the in-flight browser action finishes." : "Automation paused. Manual runs are still available.";
        const activeKey = runningRef.current;
        if (activeKey) updateJob(activeKey, { detail });
        statusRef.current(detail);
      } else {
        stopRequestedRef.current = false;
        statusRef.current("Automation resumed. The queue will start the next due job automatically.");
        kickScheduler();
      }

      return next;
    });
  }

  function toggleIdleCrawler() {
    if (!normalisedUsername) return;
    setIdleCrawlerEnabled((current) => {
      const next = !current;
      writeIdleCrawlerEnabled(normalisedUsername, next);

      if (!next) {
        if (runningRef.current === "idleCrawl") {
          stopRequestedRef.current = true;
          const detail = "Idle crawler turned off. The current idle target will finish safely, then idle crawling will stop.";
          updateJob("idleCrawl", { detail });
          statusRef.current(detail);
        } else {
          statusRef.current("Idle crawler turned off. Profile scans and deep dives will continue to run automatically.");
        }
      } else {
        statusRef.current("Idle crawler turned on. It will run automatically when profile scans and deep dives are not due.");
        kickScheduler();
      }

      return next;
    });
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isReady || !automationEnabled || runningRef.current) return;
    const due = jobs.find((job) => job.nextRunAt <= now && (job.key !== "deepDive" || Boolean(scanId)) && (job.key !== "idleCrawl" || idleCrawlerEnabled));
    if (!due) return;

    if (due.key === "profile") void runProfileJob();
    if (due.key === "deepDive") void runDeepDiveJob(false);
    if (due.key === "idleCrawl") void runIdleCrawlJob(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automationEnabled, idleCrawlerEnabled, isReady, jobs, now, scanId]);

  const activeJob = jobs.find((job) => job.status === "running") ?? null;
  const nextJob = useMemo(() => [...jobs].filter((job) => (job.key !== "deepDive" || Boolean(scanId)) && (job.key !== "idleCrawl" || idleCrawlerEnabled)).sort((a, b) => a.nextRunAt - b.nextRunAt)[0] ?? null, [idleCrawlerEnabled, jobs, scanId]);

  if (!normalisedUsername) return null;

  return (
    <section className={`${cardClass} mb-4 p-5`} id="local-queue">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="ui-eyebrow">Local extension queue</span>
          <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Scheduled browser jobs</h2>
          <p className={mutedClass}>Local only. The extension handles Reddit-facing work using this browser session. Idle crawling keeps collecting data when priority work is empty.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={isReady ? "status-pill status-panel--ok" : "status-pill status-panel--off"}>{isReady ? "Extension ready" : "Extension needed"}</span>
          <span className={automationEnabled ? "status-pill status-panel--ok" : "status-pill status-panel--off"}>{automationEnabled ? "Automation on" : "Automation off"}</span>
          <span className={idleCrawlerEnabled ? "status-pill status-panel--ok" : "status-pill status-panel--off"}>{idleCrawlerEnabled ? "Idle on" : "Idle off"}</span>
          <button className={buttonClass()} type="button" disabled={!isReady} onClick={toggleAutomation}>
            {automationEnabled ? "Pause all automation" : "Resume all automation"}
          </button>
          <button className={buttonClass()} type="button" disabled={!isReady} onClick={toggleIdleCrawler}>
            {idleCrawlerEnabled ? "Turn idle off" : "Turn idle on"}
          </button>
          {activeJob ? (
            <button className={buttonClass("text-[var(--danger)]")} type="button" onClick={stopCurrentJob}>
              Stop current job
            </button>
          ) : null}
        </div>
      </div>

      <div className="mb-4 rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
        {activeJob ? (
          <div className="grid gap-2">
            <p className="m-0 font-extrabold text-[var(--text)]">Currently running: {activeJob.title}</p>
            <p className="m-0 text-sm leading-relaxed text-[var(--text-muted)]">{activeJob.detail}</p>
          </div>
        ) : !automationEnabled ? (
          <div className="grid gap-2">
            <p className="m-0 font-extrabold text-[var(--text)]">Automation paused</p>
            <p className="m-0 text-sm leading-relaxed text-[var(--text-muted)]">Scheduled jobs will not start automatically. Manual Run now, Run all due, and Run sweep buttons are still available.</p>
          </div>
        ) : !idleCrawlerEnabled && nextJob ? (
          <div className="grid gap-2">
            <p className="m-0 font-extrabold text-[var(--text)]">Idle crawler paused · next priority job: {nextJob.title} in {duration(nextJob.nextRunAt - now)}</p>
            <p className="m-0 text-sm leading-relaxed text-[var(--text-muted)]">Idle crawling is off, but profile scans and deep dives will continue automatically.</p>
          </div>
        ) : nextJob ? (
          <div className="grid gap-2">
            <p className="m-0 font-extrabold text-[var(--text)]">Next job: {nextJob.title} in {duration(nextJob.nextRunAt - now)}</p>
            <p className="m-0 text-sm leading-relaxed text-[var(--text-muted)]">{nextJob.detail}</p>
          </div>
        ) : !idleCrawlerEnabled ? (
          <div className="grid gap-2">
            <p className="m-0 font-extrabold text-[var(--text)]">Idle crawler paused</p>
            <p className="m-0 text-sm leading-relaxed text-[var(--text-muted)]">Idle crawling is off. Profile scans and deep dives will still run when they are due.</p>
          </div>
        ) : (
          <p className="m-0 font-extrabold text-[var(--text)]">No local jobs scheduled.</p>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {jobs.map((job) => (
          <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4" key={job.key}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <strong className="block text-[var(--text)]">{job.title}</strong>
                <small className="text-[var(--text-muted)]">
                  Every {duration(job.cadenceMs)}
                  {job.key === "deepDive" ? ` · scheduled batch ${settings.deepDiveBatchSize}` : ""}
                  {job.key === "idleCrawl" ? ` · batch ${settings.idleCrawlBatchSize}` : ""}
                  {job.key === "idleCrawl" && !idleCrawlerEnabled ? " · scheduled idle off" : ""}
                </small>
              </div>
              <span className={job.key === "idleCrawl" && !idleCrawlerEnabled && job.status !== "running" ? "status-pill status-panel--off" : statusClass(job.status)}>{job.key === "idleCrawl" && !idleCrawlerEnabled && job.status !== "running" ? "off" : job.status}</span>
            </div>
            <p className="mb-3 text-sm leading-relaxed text-[var(--text-muted)]">{job.key === "idleCrawl" && !idleCrawlerEnabled && job.status !== "running" ? "Scheduled idle crawling is off. Profile scans and deep dives still run automatically; manual idle runs are still available." : job.detail}</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-bold text-[var(--text)]">
                <span>Next: {job.status === "running" ? "running now" : automationEnabled ? job.key === "idleCrawl" && !idleCrawlerEnabled ? "idle off" : duration(job.nextRunAt - now) : "paused"}</span>
                <span className="ml-3 text-[var(--text-muted)]">Last duration: {duration(job.lastDurationMs)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={buttonClass()} type="button" disabled={!isReady || Boolean(runningRef.current) || (job.key === "deepDive" && !scanId)} onClick={() => runNow(job.key)}>
                  Run now
                </button>
                {job.key === "deepDive" ? (
                  <button className={buttonClass()} type="button" disabled={!isReady || Boolean(runningRef.current) || !scanId} onClick={runAllDueDeepDives}>
                    Run all due
                  </button>
                ) : null}
                {job.key === "idleCrawl" ? (
                  <button className={buttonClass()} type="button" disabled={!isReady || Boolean(runningRef.current)} onClick={runIdleSweep}>
                    Run sweep
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
