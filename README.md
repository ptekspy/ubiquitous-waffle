# PaidPolitely Reddit Analytics

v0.1.0 of the PaidPolitely Reddit account analytics SaaS.

This first version deliberately avoids Reddit OAuth. It analyses a public Reddit account by fetching the public `.json` endpoints that Reddit exposes for profiles, submissions, and comments.

## What v0.1.0 does

- Accepts a Reddit username, profile URL, or `u/username` value.
- Fetches public profile data from `about.json`.
- Fetches the latest public submitted posts.
- Fetches the latest public comments.
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
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

Copy `.env.example` to `.env.local` if you want to customise the Reddit user-agent:

```bash
REDDIT_USER_AGENT="PaidPolitelyAnalytics/0.1.0 by u/your_reddit_username"
```

## API

```http
GET /api/analyze?username=MrMrsHK
```

Returns:

```ts
type AnalyzeResponse = {
  profile: RedditProfile;
  analytics: AccountAnalytics;
};
```

## Next iteration ideas

- Store imported snapshots in Postgres.
- Add username ownership verification via profile bio code.
- Add historical score tracking.
- Add shareable reports.
- Add PaidPolitely network/subreddit recommendations.
- Add optional browser extension import for private-visible metrics.
