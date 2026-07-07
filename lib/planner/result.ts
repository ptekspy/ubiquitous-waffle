import type { JsonObject } from "@/lib/types";

export type PlannerExperimentView = {
  name: string;
  subreddits: string[];
  titleAngle: string;
  successMetric: string;
};

export type PlannerNextPostView = {
  theme: string;
  titleDrafts: string[];
  primarySubreddit: string;
  secondarySubreddits: string[];
  format: string;
  postingWindowUtc: string;
  reasoning: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function plannerSummary(result: JsonObject | null): string | null {
  if (!result) return null;
  const summary = stringValue(result.summary);
  return summary.length > 0 ? summary : null;
}

export function plannerAvoidList(result: JsonObject | null): string[] {
  if (!result) return [];
  return stringArray(result.avoid);
}

export function plannerNextPost(result: JsonObject | null): PlannerNextPostView | null {
  if (!result || !isRecord(result.nextPost)) return null;
  const nextPost = result.nextPost;

  return {
    theme: stringValue(nextPost.theme),
    titleDrafts: stringArray(nextPost.titleDrafts),
    primarySubreddit: stringValue(nextPost.primarySubreddit),
    secondarySubreddits: stringArray(nextPost.secondarySubreddits),
    format: stringValue(nextPost.format),
    postingWindowUtc: stringValue(nextPost.postingWindowUtc),
    reasoning: stringArray(nextPost.reasoning),
  };
}

export function plannerExperiments(result: JsonObject | null): PlannerExperimentView[] {
  if (!result || !Array.isArray(result.experiments)) return [];

  return result.experiments.filter(isRecord).map((experiment) => ({
    name: stringValue(experiment.name),
    subreddits: stringArray(experiment.subreddits),
    titleAngle: stringValue(experiment.titleAngle),
    successMetric: stringValue(experiment.successMetric),
  }));
}
