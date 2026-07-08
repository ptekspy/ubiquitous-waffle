import type { Prisma } from "@prisma/client";

export type ScanQuality = {
  score: number;
  status: "ok" | "warn" | "off";
  label: string;
  detail: string;
  warnings: string[];
};

type ScanQualityInput = {
  rawPostCount: number;
  rawCommentCount: number;
  cleanedPostCount: number;
  cleanedCommentCount: number;
  warnings: Prisma.JsonValue | null;
  metadata: Prisma.JsonValue | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataFlag(metadata: Prisma.JsonValue | null, key: string): boolean {
  if (!isObject(metadata)) return false;
  const headless = metadata.headless;
  return isObject(headless) && headless[key] === true;
}

function warningList(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function buildScanQuality(scan: ScanQualityInput | null): ScanQuality {
  if (!scan) {
    return {
      score: 0,
      status: "off",
      label: "No scan yet",
      detail: "Run the first extension scan to measure capture quality.",
      warnings: [],
    };
  }

  const warnings = warningList(scan.warnings);
  const submittedTruncated = metadataFlag(scan.metadata, "submittedTruncated");
  const commentsTruncated = metadataFlag(scan.metadata, "commentsTruncated");
  const rawRows = scan.rawPostCount + scan.rawCommentCount;
  const cleanedRows = scan.cleanedPostCount + scan.cleanedCommentCount;
  const removedRows = Math.max(0, rawRows - cleanedRows);
  const removedRatio = rawRows > 0 ? removedRows / rawRows : 0;

  let score = 100;
  if (cleanedRows === 0) score -= 70;
  if (scan.cleanedPostCount === 0) score -= 20;
  if (submittedTruncated) score -= 12;
  if (commentsTruncated) score -= 8;
  score -= Math.min(20, Math.round(removedRatio * 25));
  score -= Math.min(12, warnings.length * 3);
  score = Math.max(0, Math.min(100, score));

  const qualityWarnings = [
    submittedTruncated ? "Submitted posts were truncated by the page limit." : null,
    commentsTruncated ? "Comments were truncated by the page limit." : null,
    removedRows > 0 ? `${removedRows} duplicate, promo, comment-link, or incomplete rows were removed.` : null,
    ...warnings,
  ].filter((item): item is string => Boolean(item));

  return {
    score,
    status: score >= 80 ? "ok" : score >= 50 ? "warn" : "off",
    label: `Scan quality ${score}%`,
    detail: `${scan.cleanedPostCount} posts and ${scan.cleanedCommentCount} comments usable from ${rawRows || cleanedRows} captured rows.`,
    warnings: qualityWarnings.slice(0, 5),
  };
}
