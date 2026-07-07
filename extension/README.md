# PaidPolitely Capture extension

Local unpacked Chrome/Edge extension for the v0.2.1 browser bridge.

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
6. Click the extension icon. You should now see a small **PaidPolitely Capture** popup.
7. Open or reload `http://localhost:3000` and click **Check extension**.

In v0.2.1 the website first detects the extension through a content script injected into the PaidPolitely page, so `NEXT_PUBLIC_PAIDPOLITELY_EXTENSION_ID` can stay blank for local testing.

## Expected local test sequence

Before installing the extension, the website should show **Not detected**.

After installing or reloading the unpacked extension, reload the website tab. The extension panel should show **Installed** and mention the `content-script` bridge.

If you change any file under `extension/`, go back to `chrome://extensions`, click **Reload** on the PaidPolitely Capture card, then reload `http://localhost:3000`.

## Scan flow

1. Enter a username such as `MrMrsHK`.
2. Click **Scan u/MrMrsHK**.
3. The extension will focus an existing Reddit profile tab or open `https://www.reddit.com/user/MrMrsHK/submitted/`.
4. If Reddit asks for login or age confirmation, follow the signpost in the Reddit tab and then click **Continue scan**.
5. The extension scrolls/captures the profile and returns the payload to the website.
6. The website imports it automatically and renders the analytics dashboard.

## Troubleshooting

### Clicking the extension icon does nothing

You are probably running an older unpacked copy. Pull latest, then click **Reload** on the extension card in `chrome://extensions`. v0.2.1 includes a popup.

### Website cannot detect the extension

1. Make sure the extension card says v0.2.1.
2. Click **Reload** on the extension card in `chrome://extensions`.
3. Fully reload `http://localhost:3000` after reloading the extension.
4. Make sure the app is running on `http://localhost:3000` or `http://127.0.0.1:3000`.
5. Open DevTools on the PaidPolitely page and check for extension/content-script errors.

## Production notes

For production, publish the extension to the Chrome Web Store and set:

```bash
NEXT_PUBLIC_PAIDPOLITELY_EXTENSION_ID="chrome-web-store-extension-id"
NEXT_PUBLIC_PAIDPOLITELY_EXTENSION_STORE_URL="https://chromewebstore.google.com/detail/..."
```

The `externally_connectable.matches` and `content_scripts.matches` lists in `manifest.json` must include every web origin that is allowed to talk to the extension.
