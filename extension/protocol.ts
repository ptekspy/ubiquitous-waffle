export type PaidPolitelyPingMessage = {
  type: "PAIDPOLITELY_PING";
};

export type PaidPolitelyScanProfileMessage = {
  type: "PAIDPOLITELY_SCAN_REDDIT_PROFILE";
  username: string;
  preferHeadless?: boolean;
  openInBackground?: boolean;
};

export type PaidPolitelyCaptureProfileHtmlMessage = {
  type: "PAIDPOLITELY_CAPTURE_REDDIT_PROFILE_HTML";
  username: string;
  openInBackground?: boolean;
};

export type PaidPolitelyFetchSubredditFlairsMessage = {
  type: "PAIDPOLITELY_FETCH_SUBREDDIT_FLAIRS";
  subreddit: string;
};

export type PaidPolitelyExtensionMessage = PaidPolitelyPingMessage | PaidPolitelyScanProfileMessage | PaidPolitelyCaptureProfileHtmlMessage | PaidPolitelyFetchSubredditFlairsMessage;

export type PaidPolitelyExtensionErrorStatus =
  | "bad_request"
  | "bad_username"
  | "unknown_message"
  | "extension_error"
  | "headless_blocked"
  | "headless_empty"
  | "cancelled"
  | "empty_capture"
  | "profile_unavailable"
  | "flairs_unavailable"
  | "unknown_error";

export type PaidPolitelyExtensionSuccess = {
  ok: true;
  status: "installed" | "captured" | "captured_headless" | "captured_profile_html" | "captured_subreddit_flairs";
  version?: string;
  name?: string;
  bridge?: "runtime" | "content-script";
  payload?: unknown;
};

export type PaidPolitelyExtensionFailure = {
  ok: false;
  status: PaidPolitelyExtensionErrorStatus | string;
  error: string;
};

export type PaidPolitelyExtensionResponse = PaidPolitelyExtensionSuccess | PaidPolitelyExtensionFailure;
