# PaidPolitely Reddit Analytics

v0.3.0 of the PaidPolitely Reddit account analytics SaaS.

This version adds Better Auth email/password accounts, console-printed email verification codes for local development, PostgreSQL scan persistence, a saved Reddit username per user, latest-dashboard hydration on reload, queued post deep dives, and the queued Ollama planner.

The extension does **not** read Reddit passwords, cookies, session tokens, private messages, or account settings.

## What v0.3.0 does

- Requires a Better Auth session before using the scanner UI.
- Supports email/password sign-up and sign-in.
- Verifies email with a one-time code printed to the Next.js server console.
- Saves one default Reddit username on the signed-in user.
- Reloads the latest saved dashboard automatically after sign-in or page refresh.
- Stores subreddits as first-class entities and links post/comment snapshots to them.
- Queues each captured post for a deeper thread crawl.
- Stores refreshed post score, upvote ratio, comment count, estimated up/down vote split, and top thread comments.
- Accepts a Reddit username, profile URL, or `u/username` value.
- Uses the extension no-tab scan and quiet-tab fallback when server-side JSON is blocked.
- Saves cleaned scans to PostgreSQL through Prisma 7.
- Scopes saved Reddit accounts, scans, crawler jobs, and planner jobs to the signed-in user.
- Queues next-post planner jobs instead of calling Ollama inline during the scan request.
- Shows dashboard panels for health, stats, subreddit performance, format signal, timeline, top posts, top comments, and AI planning.

## Run locally

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`.

In another terminal, run the persistent workers:

```bash
pnpm worker:crawler
pnpm worker:planner
```

## Environment

Copy `.env.example` to `.env.local` and set at least:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/paidpolitely?schema=public"
BETTER_AUTH_SECRET="replace-with-at-least-32-random-characters"
BETTER_AUTH_URL="http://localhost:3000"
OLLAMA_BASE_URL="https://ollama.tik-track.com"
OLLAMA_PLANNER_MODEL=""
PLANNER_WORKER_SECRET=""
CRAWLER_WORKER_SECRET=""
```

Generate a local auth secret with:

```bash
openssl rand -base64 32
```

## Local auth and workspace flow

1. Start `pnpm dev`.
2. Start `pnpm worker:crawler` and `pnpm worker:planner` in separate terminals.
3. Open `http://localhost:3000`.
4. Create an account with email and password.
5. Watch the terminal running `pnpm dev`.
6. Copy the printed verification code.
7. Paste it into the verification form.
8. Enter the Reddit username once and scan.
9. Refresh the page or sign out/in again; the saved username and latest persisted dashboard reload automatically.

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

Scan imports create one post deep-dive job per captured post.

The persistent crawler calls:

```http
POST /api/crawler/posts/process
Authorization: Bearer <CRAWLER_WORKER_SECRET>
```

Local development can omit `CRAWLER_WORKER_SECRET`; if it is blank the endpoint can also use `PLANNER_WORKER_SECRET`.

Reddit does not expose exact raw likes. The crawler stores public score, upvote ratio, comment count, estimated upvotes/downvotes, and thread comments.

## Planner queue

Scan imports create a queued planner job. The website does not call Ollama directly while handling the scan request.

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
