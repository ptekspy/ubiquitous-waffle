export type PaidPolitelyPingMessage = {
  type: "PAIDPOLITELY_PING";
};

export type PaidPolitelyScanProfileMessage = {
  type: "PAIDPOLITELY_SCAN_REDDIT_PROFILE";
  username: string;
  preferHeadless?: boolean;
  openInBackground?: boolean;
};

export type PaidPolitelyExtensionMessage = PaidPolitelyPingMessage | PaidPolitelyScanProfileMessage;

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
  | "unknown_error";

export type PaidPolitelyExtensionSuccess = {
  ok: true;
  status: "installed" | "captured" | "captured_headless";
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
