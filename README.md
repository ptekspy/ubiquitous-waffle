# PaidPolitely Reddit Analytics

v0.2.4 of the PaidPolitely Reddit account analytics SaaS.

This version deliberately avoids Reddit OAuth. It first tries public server-side Reddit JSON. If Reddit blocks that, the browser extension now tries a no-tab browser-session JSON scan before falling back to the quiet background-tab scanner.

The extension does **not** read Reddit passwords, cookies, session tokens, private messages, or account settings.

## What v0.2.4 does

- Accepts a Reddit username, profile URL, or `u/username` value.
- Tries public server-side profile data from `about.json`.
- Tries latest public submitted posts and comments.
- Detects whether the PaidPolitely Capture extension is installed via a content-script bridge on the PaidPolitely page.
- Falls back to direct `chrome.runtime.sendMessage(extensionId, ...)` if an extension ID is configured.
- Adds an extension popup so clicking the extension icon confirms it is installed.
- Extension scan strategy:
  - first tries Reddit `about.json`, `submitted.json`, and `comments.json` from the extension service worker with browser credentials included
  - if Reddit blocks or empties those JSON responses, falls back to a quiet background tab
  - only brings Reddit forward when login, age confirmation, or troubleshooting is needed
- Auto-scrolls the Reddit profile during tab fallback so virtualised posts are mounted into the DOM.
- Dedupes captured rows by Reddit post id/permalink.
- Cleans duplicate, game/promo, comment-link, or incomplete browser rows from imported post analytics.
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
- No Chrome Web Store package yet.
- No payments or multi-user auth.

Those are intentionally left for later iterations.

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Environment

Copy `.env.example` to `.env.local` if you want to customise Reddit request behaviour:

```bash
REDDIT_USER_AGENT="web:paidpolitely.reddit-analytics:v0.2.1 (by /u/ptekspy)"
REDDIT_BROWSER_USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
REDDIT_DEBUG="0"
NEXT_PUBLIC_PAIDPOLITELY_EXTENSION_ID=""
NEXT_PUBLIC_PAIDPOLITELY_EXTENSION_STORE_URL=""
```

Set `REDDIT_DEBUG=1` locally to print failed Reddit fetch attempts to the dev server console.

`NEXT_PUBLIC_PAIDPOLITELY_EXTENSION_ID` can stay blank for local v0.2.4 testing because the website detects the extension through the injected content-script bridge. Set it only if you want to test the direct extension-ID fallback.

## API

Server-side public JSON attempt:

```http
GET /api/analyze?username=MrMrsHK
```

Browser/extension capture import:

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

## Extension bridge workflow

### 1. Confirm the website handles missing extension state

Run the app before installing the extension:

```bash
pnpm dev
```

Open `http://localhost:3000`. The extension panel should show **Not detected**.

### 2. Install or reload the unpacked extension locally

1. Open Chrome or Edge.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this repo's `extension` folder.
6. Click the PaidPolitely Capture extension icon. A popup should appear. If nothing appears, click **Reload** on the extension card in `chrome://extensions`.
7. Reload `http://localhost:3000` so the content-script bridge attaches to the page.
8. Click **Check extension**.

The extension panel should show **Installed** and mention the `content-script` bridge.

### 3. Scan with the extension

1. Enter a Reddit username, for example `MrMrsHK`.
2. Click **Scan u/MrMrsHK**.
3. The extension first tries a no-tab Reddit JSON scan from its service worker.
4. If Reddit blocks that, the extension reuses an existing matching Reddit profile tab or opens `https://www.reddit.com/user/MrMrsHK/submitted/` quietly in the background.
5. If Reddit asks you to sign in or confirm mature content, follow the signpost in the Reddit tab, then click **Continue scan**.
6. The website imports the payload automatically and renders the analytics dashboard.

### Troubleshooting detection

If the website still says **Not detected**:

1. Pull latest.
2. Go to `chrome://extensions`.
3. Click **Reload** on the PaidPolitely Capture card.
4. Click the extension icon and confirm the popup appears.
5. Fully reload `http://localhost:3000`.
6. Click **Check extension** again.
7. Open DevTools on the PaidPolitely page and check the Console if it still fails.

## Manual browser capture fallback

Keep this for debugging while the extension is local-only:

1. Open the Reddit profile in your normal browser.
2. In PaidPolitely, click **Copy robust capture snippet**.
3. Open DevTools on the Reddit page.
4. Paste the snippet into the console and run it.
5. Leave the page alone while it scrolls down, captures mounted posts, returns to the starting position, and copies JSON to your clipboard.
6. Paste that JSON into PaidPolitely and click **Analyse browser import**.

## Next iteration ideas

- Package and publish the extension to the Chrome Web Store.
- Store imported snapshots in Postgres.
- Add username ownership verification via profile bio code.
- Add historical score tracking.
- Add shareable reports.
- Add PaidPolitely network/subreddit recommendations.
