const PAIDPOLITELY_WEB_REQUEST = "PAIDPOLITELY_EXTENSION_BRIDGE_REQUEST";
const PAIDPOLITELY_WEB_RESPONSE = "PAIDPOLITELY_EXTENSION_BRIDGE_RESPONSE";
const PAIDPOLITELY_READY = "PAIDPOLITELY_EXTENSION_BRIDGE_READY";
const PAIDPOLITELY_CHANNEL_CLOSED_PATTERN = /message channel closed|receiving end does not exist|extension context invalidated/i;

function postToPage(payload) {
  window.postMessage(payload, window.location.origin);
}

postToPage({
  source: "paidpolitely-extension",
  type: PAIDPOLITELY_READY,
  response: {
    ok: true,
    status: "installed",
    version: chrome.runtime.getManifest().version,
    name: chrome.runtime.getManifest().name,
    bridge: "content-script",
  },
});

window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  const data = event.data;
  if (!data || data.source !== "paidpolitely-web" || data.type !== PAIDPOLITELY_WEB_REQUEST) return;

  chrome.runtime.sendMessage(data.payload, (response) => {
    const lastError = chrome.runtime.lastError;
    const errorMessage = lastError?.message || "";

    postToPage({
      source: "paidpolitely-extension",
      type: PAIDPOLITELY_WEB_RESPONSE,
      requestId: data.requestId,
      response: errorMessage
        ? {
            ok: false,
            status: PAIDPOLITELY_CHANNEL_CLOSED_PATTERN.test(errorMessage) ? "extension_channel_closed" : "bridge_error",
            error: PAIDPOLITELY_CHANNEL_CLOSED_PATTERN.test(errorMessage)
              ? "PaidPolitely Capture stopped replying before the browser work finished. Reload the extension if this keeps happening."
              : errorMessage,
          }
        : response,
    });
  });
});
