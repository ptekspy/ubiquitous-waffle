import type { AnalyzeResponse } from "@/lib/types";
import { isApiError } from "@/utils/is-api-error";
import { readJsonResponse } from "@/utils/read-json-response";
import type { ApiError } from "./types";

const JSON_FALLBACK_ERROR: ApiError = {
  error: "The server returned a non-JSON response.",
};

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
};

export type CurrentUserResponse = {
  user: CurrentUser | null;
};

export type CurrentUserApiResult =
  | {
      ok: true;
      data: CurrentUserResponse;
    }
  | {
      ok: false;
      error: string;
    };

export type AnalysisApiResult =
  | {
      ok: true;
      data: AnalyzeResponse;
    }
  | {
      ok: false;
      error: string;
    };

export type ImportBrowserPayloadOptions = {
  enqueueDeepDiveJobs?: boolean;
  enqueuePlannerJob?: boolean;
};

export type WorkspaceResponse = {
  settings: {
    redditUsername: string | null;
  };
  latest: AnalyzeResponse | null;
};

export type WorkspaceApiResult =
  | {
      ok: true;
      data: WorkspaceResponse;
    }
  | {
      ok: false;
      error: string;
    };

export type BrowserCrawlerJob = {
  id: string;
  redditId: string;
  title: string;
  subreddit: string;
  permalink: string;
};

export type BrowserCrawlerClaimResult =
  | {
      ok: true;
      job: BrowserCrawlerJob | null;
    }
  | {
      ok: false;
      error: string;
    };

export type BrowserCrawlerImportResult =
  | {
      ok: true;
      comments: number;
    }
  | {
      ok: false;
      error: string;
    };

export type HistoricalSnapshotImportResult =
  | {
      ok: true;
      snapshotId: string;
      postCount: number;
      commentCount: number;
      viewObservationCount?: number;
    }
  | {
      ok: false;
      error: string;
    };

export type IdleCrawlerTarget = {
  id: string;
  kind: "SUBREDDIT_FEED" | "HOME_FEED" | "USER_PROFILE";
  label: string;
  subreddit: string | null;
  username: string | null;
  feed: string;
  forced: boolean;
};

export type IdleCrawlerClaimResult =
  | {
      ok: true;
      target: IdleCrawlerTarget | null;
    }
  | {
      ok: false;
      error: string;
    };

export type IdleCrawlerImportResult =
  | {
      ok: true;
      posts?: number;
      comments?: number;
      users?: number;
      failed?: boolean;
    }
  | {
      ok: false;
      error: string;
    };

export type IdleCrawlerSummary = {
  generatedAt: string;
  counts: {
    targets: number;
    dueTargets: number;
    collectedUsers: number;
    posts: number;
    comments: number;
  };
  targets: Array<{
    id: string;
    kind: string;
    label: string;
    subreddit: string | null;
    username: string | null;
    feed: string;
    priority: number;
    enabled: boolean;
    lastCompletedAt: string | null;
    nextDueAt: string | null;
    lastStatus: string | null;
    lastError: string | null;
    lastPostCount: number;
    lastCommentCount: number;
  }>;
  posts: Array<{
    id: string;
    redditId: string;
    title: string;
    subreddit: string;
    author: string | null;
    permalink: string;
    feed: string;
    score: number;
    numComments: number;
    lastSeenAt: string;
  }>;
  users: Array<{
    id: string;
    username: string;
    source: string | null;
    postMentions: number;
    commentMentions: number;
    latestScore: number | null;
    latestFollowers: number | null;
    lastSeenAt: string;
    lastProfileCrawledAt: string | null;
    nextProfileCrawlAt: string | null;
  }>;
};

export type IdleCrawlerSummaryResult =
  | {
      ok: true;
      data: IdleCrawlerSummary;
    }
  | {
      ok: false;
      error: string;
    };

export async function fetchCurrentUser(): Promise<CurrentUserApiResult> {
  try {
    const response = await fetch(`/api/me?ts=${Date.now()}`, { cache: "no-store" });
    const payload = await readJsonResponse<CurrentUserResponse, ApiError>(response, JSON_FALLBACK_ERROR);

    if (isApiError(payload)) return { ok: false, error: payload.error };
    return { ok: true, data: payload };
  } catch {
    return { ok: false, error: "The session request failed before the API could respond." };
  }
}

export async function fetchWorkspace(): Promise<WorkspaceApiResult> {
  try {
    const response = await fetch(`/api/workspace?ts=${Date.now()}`, { cache: "no-store" });
    const payload = await readJsonResponse<WorkspaceResponse, ApiError>(response, JSON_FALLBACK_ERROR);

    if (isApiError(payload)) return { ok: false, error: payload.error };
    return { ok: true, data: payload };
  } catch {
    return { ok: false, error: "The workspace request failed before the API could respond." };
  }
}

export async function claimBrowserCrawlerJob(): Promise<BrowserCrawlerClaimResult> {
  try {
    const response = await fetch(`/api/crawler/posts/next?ts=${Date.now()}`, { cache: "no-store" });
    const payload = await readJsonResponse<{ job: BrowserCrawlerJob | null }, ApiError>(response, JSON_FALLBACK_ERROR);

    if (isApiError(payload)) return { ok: false, error: payload.error };
    return { ok: true, job: payload.job };
  } catch {
    return { ok: false, error: "The browser crawler claim failed before the API could respond." };
  }
}

export async function importBrowserCrawlerPayload(jobId: string, payload: unknown): Promise<BrowserCrawlerImportResult> {
  try {
    const response = await fetch("/api/crawler/posts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, payload }),
    });
    const responsePayload = await readJsonResponse<{ ok: true; comments: number }, ApiError>(response, JSON_FALLBACK_ERROR);

    if (isApiError(responsePayload)) return { ok: false, error: responsePayload.error };
    return { ok: true, comments: responsePayload.comments };
  } catch {
    return { ok: false, error: "The browser crawler import failed before the API could respond." };
  }
}

export async function claimIdleCrawlerTarget(): Promise<IdleCrawlerClaimResult> {
  try {
    const response = await fetch(`/api/crawler/idle/next?ts=${Date.now()}`, { cache: "no-store" });
    const payload = await readJsonResponse<{ target: IdleCrawlerTarget | null }, ApiError>(response, JSON_FALLBACK_ERROR);

    if (isApiError(payload)) return { ok: false, error: payload.error };
    return { ok: true, target: payload.target };
  } catch {
    return { ok: false, error: "The idle crawler claim failed before the API could respond." };
  }
}

export async function importIdleCrawlerPayload(targetId: string, payload: unknown): Promise<IdleCrawlerImportResult> {
  try {
    const response = await fetch("/api/crawler/idle/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId, payload }),
    });
    const responsePayload = await readJsonResponse<{ ok: true; posts: number; comments: number; users: number }, ApiError>(response, JSON_FALLBACK_ERROR);

    if (isApiError(responsePayload)) return { ok: false, error: responsePayload.error };
    return { ok: true, posts: responsePayload.posts, comments: responsePayload.comments, users: responsePayload.users };
  } catch {
    return { ok: false, error: "The idle crawler import failed before the API could respond." };
  }
}

export async function reportIdleCrawlerFailure(targetId: string, error: string): Promise<IdleCrawlerImportResult> {
  try {
    const response = await fetch("/api/crawler/idle/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId, error }),
    });
    const responsePayload = await readJsonResponse<{ ok: true; failed: true }, ApiError>(response, JSON_FALLBACK_ERROR);

    if (isApiError(responsePayload)) return { ok: false, error: responsePayload.error };
    return { ok: true, failed: true };
  } catch {
    return { ok: false, error: "The idle crawler failure report failed before the API could respond." };
  }
}

export async function fetchIdleCrawlerSummary(): Promise<IdleCrawlerSummaryResult> {
  try {
    const response = await fetch(`/api/crawler/idle/summary?ts=${Date.now()}`, { cache: "no-store" });
    const payload = await readJsonResponse<IdleCrawlerSummary, ApiError>(response, JSON_FALLBACK_ERROR);

    if (isApiError(payload)) return { ok: false, error: payload.error };
    return { ok: true, data: payload };
  } catch {
    return { ok: false, error: "The idle crawler summary request failed before the API could respond." };
  }
}

export async function saveWorkspaceRedditUsername(redditUsername: string): Promise<WorkspaceApiResult> {
  try {
    const response = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redditUsername }),
    });
    const payload = await readJsonResponse<WorkspaceResponse, ApiError>(response, JSON_FALLBACK_ERROR);

    if (isApiError(payload)) return { ok: false, error: payload.error };
    return { ok: true, data: payload };
  } catch {
    return { ok: false, error: "The workspace save request failed before the API could respond." };
  }
}

export async function importBrowserPayload(raw: string, options: ImportBrowserPayloadOptions = {}): Promise<AnalysisApiResult> {
  try {
    const response = await fetch("/api/analyze/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw, ...options }),
    });
    const payload = await readJsonResponse<AnalyzeResponse, ApiError>(response, JSON_FALLBACK_ERROR);

    if (isApiError(payload)) {
      return { ok: false, error: payload.error };
    }

    return { ok: true, data: payload };
  } catch {
    return { ok: false, error: "The browser import request failed before the API could respond." };
  }
}

function londonDateTimeParts(value: string): { date: string; time: string } {
  const date = new Date(value);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export async function importHistoricalSnapshotPayload(input: { username: string; content: string; capturedAt: string; sourceFileName?: string | null }): Promise<HistoricalSnapshotImportResult> {
  try {
    const { date, time } = londonDateTimeParts(input.capturedAt);
    const form = new FormData();
    form.set("capturedDate", date);
    form.set("capturedTime", time);
    form.set("timezone", "Europe/London");
    form.set("username", input.username);
    form.set("content", input.content);
    if (input.sourceFileName) form.set("sourceFileName", input.sourceFileName);

    const response = await fetch("/api/history/snapshots/import", { method: "POST", body: form });
    const payload = await readJsonResponse<{ snapshotId: string; postCount: number; commentCount: number; viewObservationCount?: number }, ApiError>(response, JSON_FALLBACK_ERROR);

    if (isApiError(payload)) return { ok: false, error: payload.error };
    return { ok: true, ...payload };
  } catch {
    return { ok: false, error: "The historical snapshot import failed before the API could respond." };
  }
}

export async function fetchPublicAnalysis(username: string): Promise<AnalysisApiResult> {
  try {
    const response = await fetch(`/api/analyze?username=${encodeURIComponent(username)}`);
    const payload = await readJsonResponse<AnalyzeResponse, ApiError>(response, JSON_FALLBACK_ERROR);

    if (isApiError(payload)) {
      return { ok: false, error: payload.error };
    }

    return { ok: true, data: payload };
  } catch {
    return { ok: false, error: "The request failed before the API could respond. Use the extension scan instead." };
  }
}
