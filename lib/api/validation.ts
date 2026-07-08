import type { ProductOpsSettings } from "@/lib/product/ops";
import { isValidRedditUsername } from "@/utils/is-valid-reddit-username";
import { normaliseRedditUsername } from "@/utils/normalise-reddit-username";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; status: number };

export type ImportRequest = {
  raw: string;
  enqueueDeepDiveJobs: boolean;
  enqueuePlannerJob: boolean;
};

type ProductOpsSettingsPatch = Partial<Pick<ProductOpsSettings, "activeAccountId" | "timezone" | "profileScanInterval" | "deepDiveInterval" | "deepDiveBatchSize" | "plannerEnabled" | "plannerModel" | "weeklyReportEnabled" | "trackedSubredditText">>;

export type ProductOpsAction =
  | { action: "settings:update"; values: ProductOpsSettingsPatch }
  | { action: "planned:create"; subreddit: string; title: string; format?: string; plannedFor?: string | null; expectedScore?: number | null; expectedFollowerGain?: number | null; rationale?: string | null; notes?: string | null }
  | { action: "planned:update"; id: string; status?: string; actualScore?: number | null; actualFollowerGain?: number | null; notes?: string | null }
  | { action: "subreddit:add"; subreddit: string; notes?: string | null }
  | { action: "subreddit:update"; id: string; enabled?: boolean; notes?: string | null }
  | { action: "peer:add"; username: string; label?: string | null; notes?: string | null }
  | { action: "peer:update"; id: string; enabled?: boolean; latestScore?: number | null; latestFollowers?: number | null; notes?: string | null }
  | { action: "report:generate" };

const DEFAULT_IMPORT_PAYLOAD_LIMIT_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_LENGTH = 2_000;
const MAX_NOTES_LENGTH = 5_000;
const ALLOWED_PLANNED_STATUSES = new Set(["PLANNED", "POSTED", "SKIPPED", "CANCELLED", "DONE"]);

function payloadLimitBytes(): number {
  const configured = Number.parseInt(process.env.IMPORT_PAYLOAD_LIMIT_BYTES || "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_IMPORT_PAYLOAD_LIMIT_BYTES;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalIsoDate(value: unknown): string | null | undefined {
  const cleaned = optionalString(value, 80);
  if (cleaned === undefined || cleaned === null || cleaned === "") return cleaned;
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function requireId(value: unknown, label = "id"): ValidationResult<string> {
  if (typeof value !== "string" || value.trim().length < 6) {
    return { ok: false, status: 400, error: `${label} is required.` };
  }
  return { ok: true, value: value.trim() };
}

export function validateRedditUsername(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") return { ok: false, status: 400, error: "Reddit username is required." };
  const username = normaliseRedditUsername(value);
  if (!isValidRedditUsername(username)) return { ok: false, status: 400, error: "Enter a valid Reddit username, profile URL, or u/username value." };
  return { ok: true, value: username };
}

export function validateImportRequest(value: unknown): ValidationResult<ImportRequest> {
  if (!isObject(value)) return { ok: false, status: 400, error: "Request body must be a JSON object." };

  if (typeof value.raw !== "string" || value.raw.trim().length === 0) {
    return { ok: false, status: 400, error: "Paste JSON first." };
  }

  const limit = payloadLimitBytes();
  if (byteLength(value.raw) > limit) {
    return { ok: false, status: 413, error: `Browser import is too large. Limit is ${Math.round(limit / 1024 / 1024)}MB.` };
  }

  return {
    ok: true,
    value: {
      raw: value.raw,
      enqueueDeepDiveJobs: value.enqueueDeepDiveJobs !== false,
      enqueuePlannerJob: value.enqueuePlannerJob !== false,
    },
  };
}

export function validateProductOpsAction(value: unknown): ValidationResult<ProductOpsAction> {
  if (!isObject(value) || typeof value.action !== "string") {
    return { ok: false, status: 400, error: "Product ops action is required." };
  }

  switch (value.action) {
    case "settings:update": {
      if (!isObject(value.values)) return { ok: false, status: 400, error: "Settings values are required." };
      return { ok: true, value: { action: "settings:update", values: normaliseSettingsPatch(value.values) } };
    }

    case "planned:create": {
      const subreddit = validateRedditUsernameLikeName(value.subreddit, "Subreddit");
      if (!subreddit.ok) return subreddit;
      const title = optionalString(value.title, MAX_TEXT_LENGTH);
      if (!title) return { ok: false, status: 400, error: "Planned post title is required." };
      return {
        ok: true,
        value: {
          action: "planned:create",
          subreddit: subreddit.value,
          title,
          format: optionalString(value.format, 120) ?? undefined,
          plannedFor: optionalIsoDate(value.plannedFor) ?? null,
          expectedScore: optionalNumber(value.expectedScore) ?? null,
          expectedFollowerGain: optionalNumber(value.expectedFollowerGain) ?? null,
          rationale: optionalString(value.rationale, MAX_NOTES_LENGTH) ?? null,
          notes: optionalString(value.notes, MAX_NOTES_LENGTH) ?? null,
        },
      };
    }

    case "planned:update": {
      const id = requireId(value.id);
      if (!id.ok) return id;
      const status = optionalString(value.status, 40);
      if (status && !ALLOWED_PLANNED_STATUSES.has(status)) {
        return { ok: false, status: 400, error: "Unsupported planned post status." };
      }
      return {
        ok: true,
        value: {
          action: "planned:update",
          id: id.value,
          status: status ?? undefined,
          actualScore: optionalNumber(value.actualScore) ?? undefined,
          actualFollowerGain: optionalNumber(value.actualFollowerGain) ?? undefined,
          notes: optionalString(value.notes, MAX_NOTES_LENGTH) ?? undefined,
        },
      };
    }

    case "subreddit:add": {
      const subreddit = validateRedditUsernameLikeName(value.subreddit, "Subreddit");
      if (!subreddit.ok) return subreddit;
      return { ok: true, value: { action: "subreddit:add", subreddit: subreddit.value, notes: optionalString(value.notes, MAX_NOTES_LENGTH) ?? null } };
    }

    case "subreddit:update": {
      const id = requireId(value.id);
      if (!id.ok) return id;
      return { ok: true, value: { action: "subreddit:update", id: id.value, enabled: optionalBoolean(value.enabled), notes: optionalString(value.notes, MAX_NOTES_LENGTH) ?? undefined } };
    }

    case "peer:add": {
      const username = validateRedditUsername(value.username);
      if (!username.ok) return username;
      return { ok: true, value: { action: "peer:add", username: username.value, label: optionalString(value.label, 120) ?? null, notes: optionalString(value.notes, MAX_NOTES_LENGTH) ?? null } };
    }

    case "peer:update": {
      const id = requireId(value.id);
      if (!id.ok) return id;
      return { ok: true, value: { action: "peer:update", id: id.value, enabled: optionalBoolean(value.enabled), latestScore: optionalNumber(value.latestScore) ?? undefined, latestFollowers: optionalNumber(value.latestFollowers) ?? undefined, notes: optionalString(value.notes, MAX_NOTES_LENGTH) ?? undefined } };
    }

    case "report:generate":
      return { ok: true, value: { action: "report:generate" } };

    default:
      return { ok: false, status: 400, error: `Unsupported product ops action: ${value.action}` };
  }
}

function normaliseSettingsPatch(value: Record<string, unknown>): ProductOpsSettingsPatch {
  return {
    activeAccountId: optionalString(value.activeAccountId, 200) ?? undefined,
    timezone: optionalString(value.timezone, 120) ?? undefined,
    profileScanInterval: optionalNumber(value.profileScanInterval) ?? undefined,
    deepDiveInterval: optionalNumber(value.deepDiveInterval) ?? undefined,
    deepDiveBatchSize: optionalNumber(value.deepDiveBatchSize) ?? undefined,
    plannerEnabled: optionalBoolean(value.plannerEnabled),
    plannerModel: optionalString(value.plannerModel, 200) ?? undefined,
    weeklyReportEnabled: optionalBoolean(value.weeklyReportEnabled),
    trackedSubredditText: optionalString(value.trackedSubredditText, MAX_NOTES_LENGTH) ?? undefined,
  };
}

function validateRedditUsernameLikeName(value: unknown, label: string): ValidationResult<string> {
  if (typeof value !== "string") return { ok: false, status: 400, error: `${label} is required.` };
  const cleaned = value.trim().replace(/^r\//i, "").replace(/^u\//i, "").replace(/^@/, "");
  if (!/^[A-Za-z0-9_][A-Za-z0-9_-]{1,30}$/.test(cleaned)) {
    return { ok: false, status: 400, error: `${label} must be a valid Reddit-style name.` };
  }
  return { ok: true, value: cleaned };
}
