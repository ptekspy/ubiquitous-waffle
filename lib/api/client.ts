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

export async function importBrowserPayload(raw: string): Promise<AnalysisApiResult> {
  try {
    const response = await fetch("/api/analyze/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
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
