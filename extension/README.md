# PaidPolitely Capture extension

Local unpacked Chrome/Edge extension for the v0.2.5 browser bridge.

It lets the PaidPolitely website ask the installed extension to:

1. Try to fetch Reddit account JSON directly from the extension service worker without opening a tab.
2. Page through Reddit listing cursors for submitted posts and comments, up to 10 pages each.
3. Fall back to a quiet background Reddit tab if Reddit blocks or empties the JSON response.
4. Bring Reddit forward only if login, age confirmation, or troubleshooting is needed.
5. Capture visible Reddit post metadata from the user's normal browser session when fallback is needed.
6. Return the captured JSON to the website for `/api/analyze/import`.

It does **not** request the `cookies` permission and does **not** read Reddit passwords, cookies, session tokens, private messages, or account settings.

## Install locally

1. Open Chrome or Edge.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this repo's `extension` folder.
6. Click the extension icon. You should now see a small **PaidPolitely Capture** popup.
7. Open or reload `http://localhost:3000` and click **Check extension**.

In v0.2.5 the website first detects the extension through a content script injected into the PaidPolitely page, so `NEXT_PUBLIC_PAIDPOLITELY_EXTENSION_ID` can stay blank for local testing.

## Expected local test sequence

Before installing the extension, the website should show **Not detected**.

After installing or reloading the unpacked extension, reload the website tab. The extension panel should show **Installed** and mention the `content-script` bridge.

If you change any file under `extension/`, go back to `chrome://extensions`, click **Reload** on the PaidPolitely Capture card, then reload `http://localhost:3000`.

## Scan flow

1. Enter a username such as `MrMrsHK`.
2. Click **Scan u/MrMrsHK**.
3. The extension first tries `about.json`, `submitted.json`, and `comments.json` from its service worker with browser credentials included. This does not open a Reddit tab.
4. `submitted.json` and `comments.json` are paginated with Reddit's `after` cursor at 100 rows per page, up to 10 pages each.
5. If Reddit blocks those JSON requests or returns no usable rows, the extension reuses an existing Reddit profile tab or opens `https://www.reddit.com/user/MrMrsHK/submitted/` as a background tab.
6. If Reddit asks for login or age confirmation, the extension brings the Reddit tab forward and shows a signpost. Follow the signpost and click **Continue scan**.
7. The website imports the payload automatically and renders the analytics dashboard.

The no-tab payload includes `metadata.headless` with page count and truncation flags so you can see whether Reddit still had another cursor after the configured page limit.

## Troubleshooting

### Clicking the extension icon does nothing

You are probably running an older unpacked copy. Pull latest, then click **Reload** on the extension card in `chrome://extensions`. v0.2.5 includes a popup.

### Website cannot detect the extension

1. Make sure the extension card says v0.2.5.
2. Click **Reload** on the extension card in `chrome://extensions`.
3. Fully reload `http://localhost:3000` after reloading the extension.
4. Make sure the app is running on `http://localhost:3000` or `http://127.0.0.1:3000`.
5. Open DevTools on the PaidPolitely page and check for extension/content-script errors.

### No-tab scan falls back to a quiet tab

This is expected if Reddit blocks extension JSON or returns an empty listing. The quiet tab scanner remains the reliability fallback.

### Background tab scan misses rows

Chrome can throttle hidden tabs more aggressively than visible tabs. If a scan comes back empty or obviously incomplete, the extension will bring the Reddit tab forward so you can inspect the page. Re-running the scan with Reddit already loaded usually fixes virtualised-feed misses.

## Production notes

For production, publish the extension to the Chrome Web Store and set:

```bash
NEXT_PUBLIC_PAIDPOLITELY_EXTENSION_ID="chrome-web-store-extension-id"
NEXT_PUBLIC_PAIDPOLITELY_EXTENSION_STORE_URL="https://chromewebstore.google.com/detail/..."
```

The `externally_connectable.matches` and `content_scripts.matches` lists in `manifest.json` must include every web origin that is allowed to talk to the extension.
