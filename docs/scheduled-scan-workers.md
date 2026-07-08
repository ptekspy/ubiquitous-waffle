# Scheduled scans and deep-dive refreshes

The app now supports two background cadences:

- Profile/account scans every 15 minutes by default.
- Post/thread deep-dive refreshes every 2 hours by default.

Profile scans use the existing Reddit account scan pipeline, but they do not enqueue a deep dive for every scan. They create `AccountMetricSnapshot` rows for charting karma and follower/subscriber counts over the past hour, day, or week.

Deep-dive refreshes are handled separately. They process queued post deep-dive jobs first, then enqueue and process one due post snapshot whose `deepDiveFetchedAt` is missing or older than the configured refresh interval.

## Run locally

Run the Next app:

```bash
pnpm dev
```

Run the scheduler worker in another terminal:

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
PROFILE_SCAN_INTERVAL_MS="900000"
DEEP_DIVE_REFRESH_INTERVAL_MS="7200000"
```

In production, set `SCHEDULER_WORKER_SECRET`. The scheduler endpoints also accept `CRAWLER_WORKER_SECRET` or `PLANNER_WORKER_SECRET` as a fallback.

## Dashboard history API

The dashboard trend card reads:

```http
GET /api/metrics/account?window=hour
GET /api/metrics/account?window=day
GET /api/metrics/account?window=week
```

The response contains `totalKarma`, `linkKarma`, `commentKarma`, award karma, optional `followerCount`, and `capturedAt` points from `AccountMetricSnapshot`.
