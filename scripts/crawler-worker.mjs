const DEFAULT_TARGET = "http://localhost:3000";
const DEFAULT_INTERVAL_MS = 3_000;
const DEFAULT_ERROR_INTERVAL_MS = 15_000;

let shouldStop = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function workerTarget() {
  return (process.env.CRAWLER_WORKER_TARGET || process.env.PLANNER_WORKER_TARGET || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_TARGET).replace(/\/$/, "");
}

function workerIntervalMs() {
  const parsed = Number.parseInt(process.env.CRAWLER_WORKER_INTERVAL_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
}

function workerErrorIntervalMs() {
  const parsed = Number.parseInt(process.env.CRAWLER_WORKER_ERROR_INTERVAL_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ERROR_INTERVAL_MS;
}

function workerHeaders() {
  const secret = process.env.CRAWLER_WORKER_SECRET?.trim() || process.env.PLANNER_WORKER_SECRET?.trim();
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

function log(message, details) {
  const timestamp = new Date().toISOString();
  if (details === undefined) console.log(`[${timestamp}] ${message}`);
  else console.log(`[${timestamp}] ${message}`, details);
}

async function processOneJob() {
  const response = await fetch(`${workerTarget()}/api/crawler/posts/process`, {
    method: "POST",
    headers: workerHeaders(),
  });

  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(`Post crawler worker request failed: ${response.status} ${JSON.stringify(payload).slice(0, 300)}`);
  }

  return payload;
}

async function run() {
  log(`Post crawler worker started against ${workerTarget()}`);

  while (!shouldStop) {
    try {
      const result = await processOneJob();

      if (result?.processed) {
        log(`Processed post crawler job ${result.jobId} -> ${result.status}`, {
          comments: result.comments,
          error: result.error,
        });
      } else {
        log(result?.reason || "No queued post deep-dive jobs.");
      }

      await sleep(workerIntervalMs());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Post crawler worker loop failed.";
      log(message);
      await sleep(workerErrorIntervalMs());
    }
  }

  log("Post crawler worker stopped.");
}

process.on("SIGINT", () => {
  shouldStop = true;
});

process.on("SIGTERM", () => {
  shouldStop = true;
});

await run();
