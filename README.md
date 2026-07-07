# PaidPolitely Reddit Analytics

v0.1.3 of the PaidPolitely Reddit account analytics SaaS.

This version deliberately avoids Reddit OAuth. It first tries public Reddit JSON for profiles, submissions, and comments. If Reddit blocks server-side JSON with a 403, the UI has a browser capture fallback: open the profile in your own browser, run the copied capture snippet, paste the copied JSON, and analyse that instead.

## What v0.1.3 does

- Accepts a Reddit username, profile URL, or `u/username` value.
- Tries public profile data from `about.json`.
- Tries latest public submitted posts and comments.
- Retries public JSON requests through `www.reddit.com` and `api.reddit.com`.
- Uses API-style headers first, then browser-style headers as a fallback.
- Catches client-side fetch failures so the UI does not throw an unhandled rejection.
- Adds a browser capture fallback for when Reddit blocks server-side JSON.
- Auto-scrolls the Reddit profile during browser capture so virtualised posts are mounted into the DOM.
- Dedupes browser-captured rows by Reddit post id/permalink.
- Cleans incomplete browser rows where Reddit card wrappers expose the post title as the subreddit.
- Shows partial import warnings if data cannot be imported.
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
- No packaged browser extension.
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
REDDIT_USER_AGENT="web:paidpolitely.reddit-analytics:v0.1.2 (by /u/ptekspy)"
REDDIT_BROWSER_USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
REDDIT_DEBUG="0"
```

Set `REDDIT_DEBUG=1` locally to print failed Reddit fetch attempts to the dev server console.

## API

Server-side public JSON attempt:

```http
GET /api/analyze?username=MrMrsHK
```

Browser capture fallback:

```http
POST /api/analyze/import
Content-Type: application/json

{
  "raw": "{...browser capture JSON...}"
}
```

Returns:

```ts
type AnalyzeResponse = {
  profile: RedditProfile;
  analytics: AccountAnalytics;
  warnings: string[];
};
```

## Browser capture workflow

1. Open the Reddit profile in your normal browser.
2. In PaidPolitely, click **Copy auto-scroll capture snippet**.
3. Open DevTools on the Reddit page.
4. Paste the snippet into the console and run it.
5. Leave the page alone while it scrolls down, captures mounted posts, returns to the starting position, and copies JSON to your clipboard.
6. Paste that JSON into PaidPolitely and click **Analyse browser import**.

This is the temporary v0.1.3 bridge. It gives us a user-assisted import path while we keep the main app free of Reddit OAuth.

## Next iteration ideas

- Replace the console snippet with a tiny Chrome extension.
- Store imported snapshots in Postgres.
- Add username ownership verification via profile bio code.
- Add historical score tracking.
- Add shareable reports.
- Add PaidPolitely network/subreddit recommendations.
