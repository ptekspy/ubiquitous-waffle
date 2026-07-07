# PaidPolitely Reddit Analytics

v0.3.0 of the PaidPolitely Reddit account analytics SaaS.

This version adds Better Auth email/password accounts, console-printed email verification codes for local development, PostgreSQL scan persistence, and the queued Ollama planner.

The extension does **not** read Reddit passwords, cookies, session tokens, private messages, or account settings.

## What v0.3.0 does

- Requires a Better Auth session before using the scanner UI.
- Supports email/password sign-up and sign-in.
- Verifies email with a one-time code printed to the Next.js server console.
- Accepts a Reddit username, profile URL, or `u/username` value.
- Tries public server-side profile data from `about.json`.
- Uses the extension no-tab scan and quiet-tab fallback when server-side JSON is blocked.
- Saves cleaned scans to PostgreSQL through Prisma 7.
- Scopes saved Reddit accounts, scans, and planner jobs to the signed-in user.
- Stores accounts, scans, post snapshots, comment snapshots, subreddit snapshots, repeated media groups, and planner jobs.
- Queues next-post planner jobs instead of calling Ollama inline during the scan request.
- Adds a persistent planner worker command.

## Run locally

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`.

In a second terminal, run the persistent planner worker:

```bash
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
```

Generate a local auth secret with:

```bash
openssl rand -base64 32
```

## Local auth flow

1. Start `pnpm dev`.
2. Open `http://localhost:3000`.
3. Create an account with email and password.
4. Watch the terminal running `pnpm dev`.
5. Copy the printed verification code.
6. Paste it into the verification form.
7. The scanner UI unlocks after verification/sign-in.

## Planner queue

Scan imports create a queued planner job. The website does not call Ollama directly while handling the scan request.

The persistent worker calls:

```http
POST /api/planner/jobs/process
Authorization: Bearer <PLANNER_WORKER_SECRET>
```

Local development can omit `PLANNER_WORKER_SECRET`. Production should set it.

Read a queued/completed job with:

```http
GET /api/planner/jobs?jobId=<job-id>
```

More detail: `docs/v0.3.0-persistence-and-planner.md`.

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

Returns:

```ts
type AnalyzeResponse = {
  profile: RedditProfile;
  analytics: AccountAnalytics;
  warnings: string[];
  scanId?: string;
  plannerJob?: PlannerJobSummary | null;
};
```

## Manual browser capture fallback

Keep this for debugging while the extension is local-only:

1. Open the Reddit profile in your normal browser.
2. In PaidPolitely, click **Copy robust capture snippet**.
3. Open DevTools on the Reddit page.
4. Paste the snippet into the console and run it.
5. Paste that JSON into PaidPolitely and click **Analyse browser import**.
