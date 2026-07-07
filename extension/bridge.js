const PAIDPOLITELY_WEB_REQUEST = "PAIDPOLITELY_EXTENSION_BRIDGE_REQUEST";
const PAIDPOLITELY_WEB_RESPONSE = "PAIDPOLITELY_EXTENSION_BRIDGE_RESPONSE";
const PAIDPOLITELY_READY = "PAIDPOLITELY_EXTENSION_BRIDGE_READY";

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

    postToPage({
      source: "paidpolitely-extension",
      type: PAIDPOLITELY_WEB_RESPONSE,
      requestId: data.requestId,
      response: lastError?.message
        ? { ok: false, status: "bridge_error", error: lastError.message }
        : response,
    });
  });
});
