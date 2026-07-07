import { BRIDGE_REQUEST, BRIDGE_RESPONSE, EXTENSION_ID } from "./constants";
import type { ChromeRuntime, ExtensionMessage, WindowWithChromeRuntime } from "./types";

type BridgeResponseMessage<TResponse> = {
  source: "paidpolitely-extension";
  type: typeof BRIDGE_RESPONSE;
  requestId: string;
  response: TResponse;
};

function createRequestId(): string {
  return `paidpolitely-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBridgeResponseMessage<TResponse>(value: unknown, requestId: string): value is BridgeResponseMessage<TResponse> {
  if (!isObject(value)) return false;

  return value.source === "paidpolitely-extension" && value.type === BRIDGE_RESPONSE && value.requestId === requestId;
}

function getChromeRuntime(): ChromeRuntime | undefined {
  return (window as WindowWithChromeRuntime).chrome?.runtime;
}

function sendBridgeMessage<TResponse>(message: ExtensionMessage, timeoutMs = 2200): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const requestId = createRequestId();
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("PaidPolitely Capture bridge was not detected on this page. Reload the page after loading/reloading the extension."));
    }, timeoutMs);

    function onMessage(event: MessageEvent<unknown>) {
      if (event.source !== window) return;
      if (!isBridgeResponseMessage<TResponse>(event.data, requestId)) return;

      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(event.data.response);
    }

    window.addEventListener("message", onMessage);
    window.postMessage(
      {
        source: "paidpolitely-web",
        type: BRIDGE_REQUEST,
        requestId,
        payload: message,
      },
      window.location.origin,
    );
  });
}

function sendDirectExtensionMessage<TResponse>(message: ExtensionMessage): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    if (!EXTENSION_ID) {
      reject(new Error("No extension ID fallback is configured."));
      return;
    }

    const runtime = getChromeRuntime();
    if (!runtime?.sendMessage) {
      reject(new Error("Chrome extension messaging is unavailable in this browser."));
      return;
    }

    runtime.sendMessage(EXTENSION_ID, message, (response) => {
      const lastError = getChromeRuntime()?.lastError;
      if (lastError?.message) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(response as TResponse);
    });
  });
}

export async function sendExtensionMessage<TResponse>(message: ExtensionMessage): Promise<TResponse> {
  try {
    return await sendBridgeMessage<TResponse>(message);
  } catch (bridgeError) {
    if (!EXTENSION_ID) throw bridgeError;
    return sendDirectExtensionMessage<TResponse>(message);
  }
}
