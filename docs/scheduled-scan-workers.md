# Scheduled scans and deep-dive refreshes

The app supports two cadences:

- Profile/account scans every 15 minutes by default.
- Post/thread deep-dive refreshes every 2 hours by default.

There are two different execution contexts:

- The Node scheduler worker can run server-side profile scans and deep-dive refreshes.
- Browser-assisted profile scans use the PaidPolitely Capture extension from the signed-in dashboard.

This matters because Reddit may block server-side profile JSON with a 403. When that happens, the Node worker now logs `browserRequired` instead of crashing. To use the user's Reddit browser session, keep the dashboard open with the extension installed; the dashboard runs a quiet browser-assisted profile scan every 15 minutes and imports the result through `/api/analyze/import`.

Profile scans create `AccountMetricSnapshot` rows for charting karma and follower/subscriber counts over the past hour, day, or week. They do not enqueue a deep dive for every scan.

Deep-dive refreshes are handled separately. They process queued post deep-dive jobs first, then enqueue and process one due post snapshot whose `deepDiveFetchedAt` is missing or older than the configured refresh interval.

## Run locally

Run the Next app:

```bash
pnpm dev
```

Open the dashboard in the browser and make sure PaidPolitely Capture is installed. That browser page handles extension-backed profile scans.

Run the scheduler worker in another terminal for deep-dive refreshes and optional server-side profile attempts:

```bash
pnpm worker:scheduler
```

The worker calls:

```http
POST /api/scheduler/profile/process
POST /api/scheduler/deep-dive/process
```

## Environment

Optional values:

```bash
SCHEDULER_WORKER_TARGET="http://localhost:3000"
SCHEDULER_WORKER_SECRET=""
SCHEDULER_WORKER_TICK_MS="60000"
SCHEDULER_WORKER_ERROR_TICK_MS="30000"
SCHEDULER_PROFILE_SERVER_SCAN="1"
PROFILE_SCAN_INTERVAL_MS="900000"
NEXT_PUBLIC_PROFILE_SCAN_INTERVAL_MS="900000"
DEEP_DIVE_REFRESH_INTERVAL_MS="7200000"
```

Set `SCHEDULER_PROFILE_SERVER_SCAN="0"` if Reddit always blocks server-side profile scans and you only want extension-backed profile scans from the open dashboard.

In production, set `SCHEDULER_WORKER_SECRET`. The scheduler endpoints also accept `CRAWLER_WORKER_SECRET` or `PLANNER_WORKER_SECRET` as a fallback.

## Dashboard history API

The dashboard trend card reads:

```http
GET /api/metrics/account?window=hour
GET /api/metrics/account?window=day
GET /api/metrics/account?window=week
```

The response contains `totalKarma`, `linkKarma`, `commentKarma`, award karma, optional `followerCount`, and `capturedAt` points from `AccountMetricSnapshot`.
