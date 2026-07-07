# PaidPolitely Reddit Analytics

v0.1.1 of the PaidPolitely Reddit account analytics SaaS.

This version deliberately avoids Reddit OAuth. It analyses a public Reddit account by fetching public Reddit JSON for profiles, submissions, and comments. Because public Reddit access can return 403s depending on host/network/header behaviour, the fetcher now tries multiple public JSON routes and reports partial imports instead of failing the whole scan when posts or comments are blocked.

## What v0.1.1 does

- Accepts a Reddit username, profile URL, or `u/username` value.
- Fetches public profile data from `about.json`.
- Fetches the latest public submitted posts.
- Fetches the latest public comments.
- Retries public JSON requests through `www.reddit.com` and `api.reddit.com`.
- Uses API-style headers first, then browser-style headers as a fallback.
- Shows partial import warnings if posts or comments cannot be imported.
- Calculates a lightweight analytics report:
  - total recent posts/comments
  - average post/comment score
  - best subreddit signal
  - best UTC posting hour
  - content format performance
  - recent activity timeline
  - top posts/comments
  - simple next-move recommendations

## What it does not do yet

- No OAuth.
- No database.
- No account ownership verification.
- No scheduled snapshots.
- No browser extension/session import.
- No payments or multi-user auth.

Those are intentionally left for later iterations.

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Environment

Copy `.env.example` to `.env.local` if you want to customise the Reddit request behaviour:

```bash
REDDIT_USER_AGENT="web:paidpolitely.reddit-analytics:v0.1.1 (by /u/ptekspy)"
REDDIT_BROWSER_USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
REDDIT_DEBUG="0"
```

Set `REDDIT_DEBUG=1` locally to print failed Reddit fetch attempts to the dev server console.

## API

```http
GET /api/analyze?username=MrMrsHK
```

Returns:

```ts
type AnalyzeResponse = {
  profile: RedditProfile;
  analytics: AccountAnalytics;
  warnings: string[];
};
```

## Next iteration ideas

- Store imported snapshots in Postgres.
- Add username ownership verification via profile bio code.
- Add historical score tracking.
- Add shareable reports.
- Add PaidPolitely network/subreddit recommendations.
- Add optional browser extension import for private-visible metrics.
