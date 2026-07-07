export type LoadState = "idle" | "loading" | "loaded" | "error";

export type ExtensionState = "not-configured" | "checking" | "missing" | "installed" | "scanning" | "error";

export type StepState = "done" | "active" | "todo" | "error";

export type ExtensionPingResponse = {
  ok?: boolean;
  status?: string;
  version?: string;
  name?: string;
  bridge?: string;
  error?: string;
};

export type ExtensionScanResponse =
  | {
      ok: true;
      status: "captured";
      payload: unknown;
    }
  | {
      ok: false;
      status?: string;
      error: string;
    };

export type ExtensionMessage =
  | {
      type: "PAIDPOLITELY_PING";
    }
  | {
      type: "PAIDPOLITELY_SCAN_REDDIT_PROFILE";
      username: string;
    };

export type ChromeRuntime = {
  sendMessage?: (extensionId: string, message: ExtensionMessage, callback: (response: unknown) => void) => void;
  lastError?: { message?: string };
};

export type WindowWithChromeRuntime = Window &
  typeof globalThis & {
    chrome?: {
      runtime?: ChromeRuntime;
    };
  };
