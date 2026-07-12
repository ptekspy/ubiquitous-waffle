import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function text(path) {
  return readFile(path, "utf8");
}

test("browser import route validates payloads before parsing", async () => {
  const route = await text("app/api/analyze/import/route.ts");
  assert.match(route, /validateImportRequest/);
  assert.match(route, /parseBrowserImport\(validated\.value\.raw\)/);
});

test("product ops route validates actions before mutating", async () => {
  const route = await text("app/api/product/ops/route.ts");
  assert.match(route, /validateProductOpsAction/);
  assert.match(route, /handleProductOpsAction\(user\.id, validated\.value\)/);
});

test("product ops schema is migration-owned", async () => {
  const schemaHelper = await text("lib/product/schema.ts");
  assert.doesNotMatch(schemaHelper, /CREATE TABLE/i);
  const migration = await text("prisma/migrations/20260708210000_product_ops_foundation/migration.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "WorkspaceSetting"/);
});

test("planner queue process recovers stale locks", async () => {
  const route = await text("app/api/planner/jobs/process/route.ts");
  assert.match(route, /recoverStalePlannerJobs/);
  const recovery = await text("lib/planner/recovery.ts");
  assert.match(recovery, /status: "RUNNING"/);
  assert.match(recovery, /status: "QUEUED"/);
});

test("extension does not request cookie access", async () => {
  const manifest = JSON.parse(await text("extension/manifest.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal((manifest.permissions ?? []).includes("cookies"), false);
});

test("historical post observations persist imported view counts", async () => {
  const schema = await text("prisma/schema.prisma");
  assert.match(schema, /model HistoricalPostObservation[\s\S]*viewCount\s+Int\?/);
  const migration = await text("prisma/migrations/20260709223000_historical_post_views/migration.sql");
  assert.match(migration, /ALTER TABLE "HistoricalPostObservation"/);
  assert.match(migration, /"viewCount" INTEGER/);
  const importer = await text("lib/history/snapshots.ts");
  assert.match(importer, /"viewCount", "observedAt", "raw"/);
  assert.match(importer, /\$\{post\.viewCount\}/);
});

test("historical parser reads post and comment view fields from JSON", async () => {
  const parser = await text("lib/history/snapshot-parser.ts");
  assert.match(parser, /type RawJsonPost[\s\S]*viewCount\?: unknown/);
  assert.match(parser, /type RawJsonComment[\s\S]*viewCount\?: unknown/);
  assert.match(parser, /viewCount: nullableInt\(row\.viewCount \?\? row\.views \?\? row\.latestViews\)/);
});

test("historical performance includes live post view snapshots", async () => {
  const performance = await text("lib/analytics/historical-performance.ts");
  assert.match(performance, /SELECT "redditId", "title", "subreddit", "permalink", "createdUtc", "score", "numComments", "viewCount", "observedAt"/);
  assert.match(performance, /latestViewCount: true/);
  assert.match(performance, /select: \{ capturedAt: true, score: true, numComments: true, viewCount: true \}/);
  assert.match(performance, /const viewsDelta = previousViews === null \? row\.viewCount : Math\.max\(0, row\.viewCount - previousViews\)/);
});

test("profile scans preserve visible per-post views", async () => {
  const types = await text("lib/types.ts");
  assert.match(types, /viewCount\?: number \| null/);
  const importer = await text("lib/browser-import.ts");
  assert.match(importer, /viewCount\?: unknown/);
  assert.match(importer, /asNullableNumber\(raw\.viewCount \?\? raw\.views \?\? raw\.latestViews\)/);
  const scans = await text("lib/db/scans.ts");
  assert.match(scans, /latestViewCount: post\.viewCount \?\? null/);
  const localQueue = await text("components/local-extension-job-queue.tsx");
  assert.match(localQueue, /PAIDPOLITELY_SCAN_REDDIT_PROFILE[\s\S]*preferHeadless: true/);
  const scheduler = await text("components/browser-profile-scheduler.tsx");
  assert.match(scheduler, /PAIDPOLITELY_SCAN_REDDIT_PROFILE[\s\S]*preferHeadless: true/);
  const dashboard = await text("components/dashboard-runtime-provider.tsx");
  assert.match(dashboard, /PAIDPOLITELY_SCAN_REDDIT_PROFILE[\s\S]*preferHeadless: true/);
  const serviceWorker = await text("extension/service-worker.js");
  assert.match(serviceWorker, /scanRedditProfile\(target\.username, \{ preferHeadless: true/);
  const extension = await text("extension/background.js");
  assert.match(extension, /preferHeadless: message\.preferHeadless !== false/);
  assert.match(extension, /async function scanRedditProfile\(username, options = \{ preferHeadless: true/);
  assert.match(extension, /viewCountFromNode/);
});

test("post insights refresh hourly per reddit post", async () => {
  const schema = await text("prisma/schema.prisma");
  assert.match(schema, /deepDiveInterval\s+Int\s+@default\(3600000\)/);
  assert.match(schema, /deepDiveBatchSize\s+Int\s+@default\(500\)/);
  const migration = await text("prisma/migrations/20260709234500_hourly_post_insights/migration.sql");
  assert.match(migration, /"deepDiveInterval" SET DEFAULT 3600000/);
  assert.match(migration, /"deepDiveBatchSize" SET DEFAULT 500/);
  const queue = await text("lib/crawler/deep-dive-queue.ts");
  assert.match(queue, /DEFAULT_DEEP_DIVE_REFRESH_INTERVAL_MS = 60 \* 60 \* 1000/);
  assert.match(queue, /SELECT DISTINCT ON \("redditId"\)/);
  assert.match(queue, /MAX\(COALESCE\("deepDiveFetchedAt", "latestInsightAt"\)\)/);
  const localQueue = await text("components/local-extension-job-queue.tsx");
  assert.match(localQueue, /const DEFAULT_DEEP_DIVE_INTERVAL_MS = 60 \* 60 \* 1000/);
  assert.match(localQueue, /const DEFAULT_DEEP_DIVE_BATCH_SIZE = 500/);
  const serviceWorker = await text("extension/service-worker.js");
  assert.match(serviceWorker, /async function scrapePostInsightsInPage/);
  assert.match(serviceWorker, /scanJsonForMetrics/);
  assert.match(serviceWorker, /jsonCandidates/);
  assert.match(serviceWorker, /reddit-post-insights-json/);
});

test("hourly profile scan archives full HTML as historical snapshot", async () => {
  const extensionTypes = await text("lib/extension/types.ts");
  assert.match(extensionTypes, /PAIDPOLITELY_CAPTURE_REDDIT_PROFILE_HTML/);
  assert.match(extensionTypes, /ExtensionProfileHtmlSnapshotResponse/);
  const extension = await text("extension/background.js");
  assert.match(extension, /captureRedditProfileHtmlSnapshot/);
  assert.match(extension, /document\.documentElement\.outerHTML/);
  const client = await text("lib/api/client.ts");
  assert.match(client, /importHistoricalSnapshotPayload/);
  assert.match(client, /\/api\/history\/snapshots\/import/);
  const queue = await text("components/local-extension-job-queue.tsx");
  assert.match(queue, /HISTORICAL_SNAPSHOT_STORAGE_SUFFIX = "historical-snapshot-hour"/);
  assert.match(queue, /shouldCaptureHistoricalSnapshot/);
  assert.match(queue, /PAIDPOLITELY_CAPTURE_REDDIT_PROFILE_HTML/);
  assert.match(queue, /PROFILE_HTML_SNAPSHOT_TIMEOUT_MS = 12 \* 60 \* 1000/);
});

test("hourly HTML snapshot retries interrupted extension channels", async () => {
  const queue = await text("components/local-extension-job-queue.tsx");
  assert.match(queue, /isInterruptedExtensionSnapshot/);
  assert.match(queue, /stopped replying\|message channel closed\|receiving end does not exist\|extension context invalidated/);
  assert.match(queue, /await new Promise\(\(resolve\) => window\.setTimeout\(resolve, 1500\)\)/);
  assert.match(queue, /const snapshot = await captureProfileHtmlSnapshot\(usernameValue\)/);

  const client = await text("lib/extension/client.ts");
  assert.match(client, /function sendDirectExtensionMessage<TResponse>\(message: ExtensionMessage, timeoutMs = 2200\)/);
  assert.match(client, /toExtensionMessageError\(lastError\.message\)/);
  assert.match(client, /return sendDirectExtensionMessage<TResponse>\(message, timeoutMs\)/);

  const bridge = await text("extension/bridge.js");
  assert.match(bridge, /PAIDPOLITELY_CHANNEL_CLOSED_PATTERN/);
  assert.match(bridge, /status: PAIDPOLITELY_CHANNEL_CLOSED_PATTERN\.test\(errorMessage\) \? "extension_channel_closed" : "bridge_error"/);
});

test("historical reparse refreshes full imports, not only followers", async () => {
  const route = await text("app/api/history/snapshots/import/route.ts");
  assert.match(route, /reparseHistoricalSnapshots/);
  assert.doesNotMatch(route, /reparseHistoricalSnapshotFollowers/);
  const snapshots = await text("lib/history/snapshots.ts");
  assert.match(snapshots, /replaceSnapshotObservations\(row\.id, ownerUserId, accountId, row\.capturedAt, parsed\.posts, parsed\.comments\)/);
  assert.match(snapshots, /viewObservationsImported/);
});

test("suggestions page queues Ollama-backed saved post suggestions", async () => {
  const schema = await text("prisma/schema.prisma");
  assert.match(schema, /model PostSuggestion/);
  assert.match(schema, /postSuggestions\s+PostSuggestion\[\]/);
  const migration = await text("prisma/migrations/20260710102000_post_suggestions/migration.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "PostSuggestion"/);
  const service = await text("lib/suggestions/service.ts");
  assert.match(service, /from "ollama"/);
  assert.match(service, /DEFAULT_SUGGESTION_MODEL = "qwen3\.6:27b"/);
  assert.match(service, /queueSuggestions/);
  assert.match(service, /processNextSuggestion/);
  const route = await text("app/api/suggestions/route.ts");
  assert.match(route, /queueSuggestions/);
  const processRoute = await text("app/api/suggestions/process/route.ts");
  assert.match(processRoute, /processNextSuggestion/);
  const page = await text("components/pages/suggestions-page.tsx");
  assert.match(page, /Queue selected models/);
  assert.match(page, /Suggestion library/);
  const shell = await text("components/app-shell.tsx");
  assert.match(shell, /\/dashboard\/suggestions/);
});

test("post scheduler saves drafts without publishing", async () => {
  const schema = await text("prisma/schema.prisma");
  assert.match(schema, /model PlannedPost/);
  assert.match(schema, /draftSavedAt/);
  assert.match(schema, /flairId/);
  const migration = await text("prisma/migrations/20260710110000_post_scheduler_drafts/migration.sql");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "body"/);
  const route = await text("app/api/scheduler/route.ts");
  assert.match(route, /createScheduledDraft/);
  const service = await text("lib/scheduler/post-scheduler.ts");
  assert.match(service, /status: "DRAFT"/);
  assert.doesNotMatch(service, /submit/i);
  const page = await text("components/pages/scheduler-page.tsx");
  assert.match(page, /PAIDPOLITELY_FETCH_SUBREDDIT_FLAIRS/);
  assert.match(page, /Save draft/);
  const extension = await text("extension/service-worker.js");
  assert.match(extension, /fetchSubredditFlairs/);
  const shell = await text("components/app-shell.tsx");
  assert.match(shell, /\/dashboard\/scheduler/);
});
