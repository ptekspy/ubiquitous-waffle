import type { AnalyzeResponse } from "@/lib/types";
import { isApiError } from "@/utils/is-api-error";
import { readJsonResponse } from "@/utils/read-json-response";
import type { ApiError } from "./types";

const JSON_FALLBACK_ERROR: ApiError = {
  error: "The server returned a non-JSON response.",
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
