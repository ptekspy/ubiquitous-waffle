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

export type ExtensionScanStatus = "captured" | "captured_headless";

export type ExtensionScanResponse =
  | {
      ok: true;
      status: ExtensionScanStatus;
      payload: unknown;
    }
  | {
      ok: false;
      status?: string;
      error: string;
    };

export type ExtensionProfileHtmlSnapshotResponse =
  | {
      ok: true;
      status: "captured_profile_html";
      payload: {
        username: string;
        capturedAt: string;
        content: string;
        postCount: number;
      };
    }
  | {
      ok: false;
      status?: string;
      error: string;
    };

export type ExtensionSubredditFlairsResponse =
  | {
      ok: true;
      status: "captured_subreddit_flairs";
      subreddit: string;
      flairs: Array<{
        id: string;
        text: string;
        editable: boolean;
        textColor: string | null;
        backgroundColor: string | null;
      }>;
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
      preferHeadless?: boolean;
      openInBackground?: boolean;
    }
  | {
      type: "PAIDPOLITELY_CAPTURE_REDDIT_PROFILE_HTML";
      username: string;
      openInBackground?: boolean;
    }
  | {
      type: "PAIDPOLITELY_FETCH_SUBREDDIT_FLAIRS";
      subreddit: string;
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
