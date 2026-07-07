# PaidPolitely Capture extension

Local unpacked Chrome extension for the v0.2.0 browser bridge.

It lets the PaidPolitely website ask the installed extension to:

1. Find or open a Reddit profile tab.
2. Check whether Reddit is ready to scan.
3. Signpost the user if Reddit needs login or age/mature-content confirmation.
4. Capture visible Reddit post metadata from the user's normal browser session.
5. Return the captured JSON to the website for `/api/analyze/import`.

It does **not** request the `cookies` permission and does **not** read Reddit passwords, cookies, session tokens, private messages, or account settings.

## Install locally

1. Open Chrome or Edge.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this repo's `extension` folder.
6. Copy the extension ID shown on the card.
7. Add it to the web app env:

```bash
NEXT_PUBLIC_PAIDPOLITELY_EXTENSION_ID="paste-extension-id-here"
```

8. Restart the web app:

```bash
pnpm dev
```

9. Open `http://localhost:3000` and click **Check extension**.

## Expected local test sequence

Before setting `NEXT_PUBLIC_PAIDPOLITELY_EXTENSION_ID`, the website should show that the extension bridge is not configured.

After setting a fake or old extension ID, the website should show that the extension is not detected.

After loading this unpacked extension, copying its real ID into `.env.local`, and restarting `pnpm dev`, the website should show the extension as installed.

## Scan flow

1. Enter a username such as `MrMrsHK`.
2. Click **Scan u/MrMrsHK**.
3. The extension will focus an existing Reddit profile tab or open `https://www.reddit.com/user/MrMrsHK/submitted/`.
4. If Reddit asks for login or age confirmation, follow the signpost in the Reddit tab and then click **Continue scan**.
5. The extension scrolls/captures the profile and returns the payload to the website.
6. The website imports it automatically and renders the analytics dashboard.

## Production notes

For production, publish the extension to the Chrome Web Store and set:

```bash
NEXT_PUBLIC_PAIDPOLITELY_EXTENSION_ID="chrome-web-store-extension-id"
NEXT_PUBLIC_PAIDPOLITELY_EXTENSION_STORE_URL="https://chromewebstore.google.com/detail/..."
```

The `externally_connectable.matches` list in `manifest.json` must include every web origin that is allowed to talk to the extension.
