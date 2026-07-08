# Local extension job queue

For local development, Reddit-facing scheduled work is handled by the browser and the PaidPolitely Capture extension, not the Node scheduler worker.

The dashboard shows a **Local extension queue** card with:

- what is currently running
- the next scheduled job
- countdowns for each job
- status for profile scans and post deep dives

## Cadences

Defaults:

- Profile/account scan: every 15 minutes
- Post/thread deep dive: every 2 hours

Profile scans use the extension and import through `/api/analyze/import` as lightweight scans. They create `AccountMetricSnapshot` rows for karma/follower charts, but they do **not** enqueue deep-dive jobs or planner jobs every 15 minutes.

Deep dives also run through the extension. The browser claims a due post job from `/api/crawler/posts/next`, fetches the Reddit post thread through the extension, then imports the result through `/api/crawler/posts/import`.

`/api/crawler/posts/next` can also create a due deep-dive job when no queued job exists, based on `DEEP_DIVE_REFRESH_INTERVAL_MS`.

## Run locally

Run the Next app:

```bash
pnpm dev
```

Then open the dashboard in your browser and keep it open. Make sure PaidPolitely Capture is installed and detected as ready.

That is all you need for local scheduled work.

## About `pnpm worker:scheduler`

The server scheduler is disabled by default now, because local mode should use the extension and your browser session.

If you run:

```bash
pnpm worker:scheduler
```

it should print that the server scheduler is disabled and exit without calling Reddit.

Only enable server-side attempts explicitly:

```bash
SCHEDULER_ENABLE_SERVER_WORKER="1"
SCHEDULER_PROFILE_SERVER_SCAN="1"
SCHEDULER_DEEP_DIVE_SERVER_SCAN="1"
pnpm worker:scheduler
```

For the local setup, leave those unset.

## Environment

Optional local values:

```bash
NEXT_PUBLIC_PROFILE_SCAN_INTERVAL_MS="900000"
NEXT_PUBLIC_DEEP_DIVE_REFRESH_INTERVAL_MS="7200000"
DEEP_DIVE_REFRESH_INTERVAL_MS="7200000"
```

Intervals are milliseconds:

- `900000` = 15 minutes
- `7200000` = 2 hours

## Dashboard history API

The dashboard trend card reads:

```http
GET /api/metrics/account?window=hour
GET /api/metrics/account?window=day
GET /api/metrics/account?window=week
```

The response contains `totalKarma`, `linkKarma`, `commentKarma`, award karma, optional `followerCount`, and `capturedAt` points from `AccountMetricSnapshot`.
