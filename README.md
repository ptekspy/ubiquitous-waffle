# PaidPolitely Reddit Analytics

v0.3.0 of the PaidPolitely Reddit account analytics SaaS.

This version adds Better Auth email/password accounts, console-printed email verification codes for local development, PostgreSQL scan persistence, a saved Reddit username per user, latest-dashboard hydration on reload, extension-backed local scheduled scans, queued post deep dives, and the queued Ollama planner.

The extension does **not** read Reddit passwords, cookies, session tokens, private messages, or account settings.

## What v0.3.0 does

- Requires a Better Auth session before using the scanner UI.
- Supports email/password sign-up and sign-in.
- Verifies email with a one-time code printed to the Next.js server console.
- Saves one default Reddit username on the signed-in user.
- Reloads the latest saved dashboard automatically after sign-in or page refresh.
- Stores subreddits as first-class entities and links post/comment snapshots to them.
- Uses a local extension job queue for scheduled profile scans and post deep dives.
- Stores refreshed post score, upvote ratio, comment count, estimated up/down vote split, and top thread comments.
- Accepts a Reddit username, profile URL, or `u/username` value.
- Uses the extension no-tab scan and quiet-tab fallback when server-side JSON is blocked.
- Saves cleaned scans to PostgreSQL through Prisma 7.
- Scopes saved Reddit accounts, scans, crawler jobs, and planner jobs to the signed-in user.
- Queues next-post planner jobs instead of calling Ollama inline during the scan request.
- Shows dashboard panels for health, stats, account trend chart, local job queue, subreddit performance, format signal, timeline, top posts, top comments, and AI planning.

## Run locally

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000` and keep the dashboard open with the PaidPolitely Capture extension enabled. The browser handles local scheduled profile scans and deep dives.

In another terminal, run the persistent planner worker if you want AI planning:

```bash
pnpm worker:planner
```

## Environment

Copy `.env.example` to `.env.local` and set at least:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/paidpolitely?schema=public"
BETTER_AUTH_SECRET="replace-with-at-least-32-random-characters"
BETTER_AUTH_URL="http://localhost:3000"
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_PLANNER_MODEL=""
PLANNER_WORKER_SECRET=""
CRAWLER_WORKER_SECRET=""
```

Generate a local auth secret with:

```bash
openssl rand -base64 32
```

## Planner tuning

The planner is local-first. By default it prefers smaller local Ollama models instead of selecting the largest model available.

Recommended local settings:

```bash
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_PLANNER_MODEL="qwen2.5:7b-instruct"
PLANNER_MAX_MODEL_B="14"
PLANNER_TIMEOUT_MS="85000"
PLANNER_NUM_CTX="4096"
PLANNER_NUM_PREDICT="700"
PLANNER_PROMPT_MAX_CHARS="7500"
```

Only enable very large models intentionally:

```bash
PLANNER_ALLOW_LARGE_MODELS="1"
OLLAMA_PLANNER_MODEL="your-large-model-name"
```

For normal planner use, a 7B-14B instruct model should be much faster and less likely to hit proxy or timeout errors.

## Local auth and workspace flow

1. Start `pnpm dev`.
2. Start `pnpm worker:planner` in another terminal if planning is needed.
3. Open `http://localhost:3000`.
4. Create an account with email and password.
5. Watch the terminal running `pnpm dev`.
6. Copy the printed verification code.
7. Paste it into the verification form.
8. Enter the Reddit username once and scan.
9. Keep the dashboard open for scheduled extension-backed scans and deep dives.
10. Refresh the page or sign out/in again; the saved username and latest persisted dashboard reload automatically.

## Workspace API

The workspace route is session-scoped.

```http
GET /api/workspace
```

Returns the saved Reddit username and the latest persisted dashboard payload.

Update the saved username:

```http
PATCH /api/workspace
Content-Type: application/json

{
  "redditUsername": "MrMrsHK"
}
```

## Post crawler queue

Manual scan imports create one post deep-dive job per captured post. Scheduled lightweight profile scans do not create deep-dive jobs.

Local deep dives are handled by the dashboard and PaidPolitely Capture extension. The browser claims due jobs from:

```http
GET /api/crawler/posts/next
```

Then imports the captured thread through:

```http
POST /api/crawler/posts/import
```

Reddit does not expose exact raw likes. The crawler stores public score, upvote ratio, comment count, estimated upvotes/downvotes, and thread comments.

## Planner queue

Manual scan imports create a queued planner job. The website does not call Ollama directly while handling the scan request. Scheduled profile scans do not queue planner jobs.

The persistent planner calls:

```http
POST /api/planner/jobs/process
Authorization: Bearer <PLANNER_WORKER_SECRET>
```

Local development can omit `PLANNER_WORKER_SECRET`. Production should set it.

## API

All scanner and planner status routes require a signed-in Better Auth session.

Server-side public JSON attempt:

```http
GET /api/analyze?username=MrMrsHK
```

Browser/extension capture import:

```http
POST /api/analyze/import
Content-Type: application/json

{
  "raw": "{...capture JSON...}"
}
```

## Manual browser capture fallback

Keep this for debugging while the extension is local-only:

1. Open the Reddit profile in your normal browser.
2. In PaidPolitely, click **Copy robust capture snippet**.
3. Open DevTools on the Reddit page.
4. Paste the snippet into the console and run it.
5. Paste that JSON into PaidPolitely and click **Analyse browser import**.
