const DEFAULT_TARGET = "http://localhost:3000";
const DEFAULT_TICK_MS = 60_000;
const DEFAULT_ERROR_TICK_MS = 30_000;

let shouldStop = false;
let lastProfileTick = 0;
let lastDeepDiveTick = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function target() {
  return (process.env.SCHEDULER_WORKER_TARGET || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_TARGET).replace(/\/$/, "");
}

function tickMs() {
  const parsed = Number.parseInt(process.env.SCHEDULER_WORKER_TICK_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TICK_MS;
}

function errorTickMs() {
  const parsed = Number.parseInt(process.env.SCHEDULER_WORKER_ERROR_TICK_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ERROR_TICK_MS;
}

function profileIntervalMs() {
  const parsed = Number.parseInt(process.env.PROFILE_SCAN_INTERVAL_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15 * 60 * 1000;
}

function deepDiveIntervalMs() {
  const parsed = Number.parseInt(process.env.DEEP_DIVE_REFRESH_INTERVAL_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2 * 60 * 60 * 1000;
}

function headers() {
  const secret = process.env.SCHEDULER_WORKER_SECRET?.trim() || process.env.CRAWLER_WORKER_SECRET?.trim() || process.env.PLANNER_WORKER_SECRET?.trim();
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

function log(message, details) {
  const timestamp = new Date().toISOString();
  if (details === undefined) console.log(`[${timestamp}] ${message}`);
  else console.log(`[${timestamp}] ${message}`, details);
}

async function postJson(path) {
  const response = await fetch(`${target()}${path}`, {
    method: "POST",
    headers: headers(),
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(`Scheduler request failed ${path}: ${response.status} ${JSON.stringify(payload).slice(0, 300)}`);
  }

  return payload;
}

async function maybeRunProfileScan(now) {
  if (now - lastProfileTick < profileIntervalMs()) return;
  lastProfileTick = now;

  const result = await postJson("/api/scheduler/profile/process");
  if (result?.processed) {
    log(`Profile scan saved for u/${result.username}`, { scanId: result.scanId, profilePoints: result.profilePoints });
  } else {
    log(result?.reason || "No profile scan due.");
  }
}

async function maybeRunDeepDive(now) {
  if (now - lastDeepDiveTick < deepDiveIntervalMs()) return;
  lastDeepDiveTick = now;

  const result = await postJson("/api/scheduler/deep-dive/process");
  if (result?.processed) {
    log(`Deep-dive refresh ${result.mode || "processed"}`, { jobId: result.jobId, status: result.status, comments: result.comments, error: result.error });
  } else {
    log(result?.reason || "No deep-dive refresh due.");
  }
}

async function run() {
  log(`Scheduler worker started against ${target()}`);
  lastProfileTick = Date.now() - profileIntervalMs();
  lastDeepDiveTick = Date.now() - deepDiveIntervalMs();

  while (!shouldStop) {
    try {
      const now = Date.now();
      await maybeRunProfileScan(now);
      await maybeRunDeepDive(now);
      await sleep(tickMs());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scheduler worker loop failed.";
      log(message);
      await sleep(errorTickMs());
    }
  }

  log("Scheduler worker stopped.");
}

process.on("SIGINT", () => {
  shouldStop = true;
});

process.on("SIGTERM", () => {
  shouldStop = true;
});

await run();
