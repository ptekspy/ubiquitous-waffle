import type { PlannerJobStatus as PrismaPlannerJobStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { JsonObject, PlannerJobStatus, PlannerJobSummary } from "@/lib/types";

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_PLANNER_TIMEOUT_MS = 85_000;
const DEFAULT_PLANNER_MAX_MODEL_B = 14;
const DEFAULT_PLANNER_NUM_CTX = 4096;
const DEFAULT_PLANNER_NUM_PREDICT = 700;
const DEFAULT_PLANNER_PROMPT_MAX_CHARS = 7_500;
const PLANNER_MODEL_KEYWORDS = ["qwen2.5", "qwen3", "qwen", "llama3.2", "llama3.1", "llama", "mistral", "gemma3", "gemma2", "dolphin", "nous", "hermes"];
const PLANNER_MODEL_PENALTIES = ["embed", "embedding", "clip", "code", "coder", "vision"];
const PLANNER_MODEL_BOOSTS = [
  { keyword: "qwen", score: 18_000 },
  { keyword: "instruct", score: 8_000 },
  { keyword: "chat", score: 5_000 },
  { keyword: "dolphin", score: 4_000 },
  { keyword: "hermes", score: 3_500 },
  { keyword: "mistral", score: 3_000 },
  { keyword: "llama", score: 2_500 },
];

type OllamaModelDetails = {
  parameter_size?: string;
  context_length?: number;
};

type OllamaModel = {
  name?: string;
  model?: string;
  size?: number;
  modified_at?: string;
  details?: OllamaModelDetails;
  capabilities?: string[];
};

type OllamaTagsResponse = {
  models?: OllamaModel[];
};

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  response?: string;
};

type PlannerJobRecord = {
  id: string;
  status: PrismaPlannerJobStatus;
  model: string | null;
  result: Prisma.JsonValue | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProcessPlannerJobResult =
  | { processed: true; job: PlannerJobSummary }
  | { processed: false; reason: string };

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function plannerStatus(value: PrismaPlannerJobStatus): PlannerJobStatus {
  return value;
}

export function toPlannerJobSummary(job: PlannerJobRecord): PlannerJobSummary {
  return {
    id: job.id,
    status: plannerStatus(job.status),
    model: job.model,
    result: isJsonObject(job.result) ? job.result : null,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function ollamaBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, "");
}

function ollamaHeaders(): HeadersInit {
  const token = process.env.OLLAMA_API_KEY?.trim();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function numericEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function plannerTimeoutMs(): number {
  return numericEnv("PLANNER_TIMEOUT_MS", DEFAULT_PLANNER_TIMEOUT_MS);
}

function plannerNumCtx(): number {
  return numericEnv("PLANNER_NUM_CTX", DEFAULT_PLANNER_NUM_CTX);
}

function plannerNumPredict(): number {
  return numericEnv("PLANNER_NUM_PREDICT", DEFAULT_PLANNER_NUM_PREDICT);
}

function plannerPromptMaxChars(): number {
  return numericEnv("PLANNER_PROMPT_MAX_CHARS", DEFAULT_PLANNER_PROMPT_MAX_CHARS);
}

function plannerMaxModelB(): number {
  return numericEnv("PLANNER_MAX_MODEL_B", DEFAULT_PLANNER_MAX_MODEL_B);
}

function allowLargeModels(): boolean {
  return process.env.PLANNER_ALLOW_LARGE_MODELS === "1";
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parameterSizeB(value: string | undefined): number | null {
  const match = value?.toLowerCase().match(/([0-9]+(?:\.[0-9]+)?)b/);
  return match ? Number.parseFloat(match[1] ?? "0") : null;
}

function modelSizeB(model: OllamaModel): number | null {
  const name = model.name ?? model.model ?? "";
  const nameMatch = name.toLowerCase().match(/(?:^|[^0-9])([0-9]+(?:\.[0-9]+)?)b(?:[^a-z]|$)/);
  const nameSize = nameMatch ? Number.parseFloat(nameMatch[1] ?? "0") : null;
  return nameSize ?? parameterSizeB(model.details?.parameter_size);
}

function modelKeywordScore(model: OllamaModel): number {
  const name = model.name ?? model.model ?? "";
  const lowerName = name.toLowerCase();
  const lowerCapabilities = (model.capabilities ?? []).join(" ").toLowerCase();
  const keywordIndex = PLANNER_MODEL_KEYWORDS.findIndex((keyword) => lowerName.includes(keyword));
  const keywordScore = keywordIndex === -1 ? 0 : (PLANNER_MODEL_KEYWORDS.length - keywordIndex) * 750;
  const penalty = PLANNER_MODEL_PENALTIES.some((keyword) => lowerName.includes(keyword)) ? 50_000 : 0;
  const boostScore = PLANNER_MODEL_BOOSTS.reduce((sum, boost) => {
    const haystack = `${lowerName} ${lowerCapabilities}`;
    return haystack.includes(boost.keyword) ? sum + boost.score : sum;
  }, 0);
  const size = modelSizeB(model);
  const sizeScore = size ? Math.max(0, 16 - Math.abs(size - 8)) * 650 : 0;
  const tooLargePenalty = !allowLargeModels() && size && size > plannerMaxModelB() ? 90_000 + size * 1_000 : 0;
  const contextScore = Math.min((model.details?.context_length ?? 0) / 10_000, 30);

  return keywordScore + boostScore + sizeScore + contextScore - penalty - tooLargePenalty;
}

function choosePlannerModel(models: OllamaModel[]): string | null {
  const usable = models
    .map((model) => ({ name: model.name?.trim() ?? model.model?.trim() ?? "", score: modelKeywordScore(model), size: modelSizeB(model), bytes: model.size ?? 0 }))
    .filter((model) => model.name.length > 0)
    .sort((a, b) => b.score - a.score || Math.abs((a.size ?? 8) - 8) - Math.abs((b.size ?? 8) - 8) || a.bytes - b.bytes || a.name.localeCompare(b.name));

  const preferred = usable.find((model) => allowLargeModels() || model.size === null || model.size <= plannerMaxModelB());
  return preferred?.name ?? usable[0]?.name ?? null;
}

async function resolvePlannerModel(): Promise<string> {
  const configured = process.env.OLLAMA_PLANNER_MODEL?.trim();
  if (configured) return configured;

  const response = await fetch(`${ollamaBaseUrl()}/api/tags`, {
    method: "GET",
    cache: "no-store",
    headers: ollamaHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Unable to list Ollama models. ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as OllamaTagsResponse;
  const selectedModel = choosePlannerModel(payload.models ?? []);

  if (!selectedModel) {
    throw new Error("No Ollama planner model was configured and /api/tags returned no models.");
  }

  return selectedModel;
}

function stringifyList(values: string[]): string {
  return values.length === 0 ? "None" : values.join("\n");
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 20)}\n...truncated...`;
}

function cleanText(value: string, maxLength = 160): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

async function buildPlannerPrompt(scanId: string, ownerId?: string): Promise<string> {
  const scan = await prisma.accountScan.findFirst({
    where: {
      id: scanId,
      ...(ownerId ? { account: { ownerUserId: ownerId } } : {}),
    },
    include: {
      account: true,
      postSnapshots: {
        orderBy: [{ score: "desc" }, { numComments: "desc" }],
        take: 8,
      },
      subredditSnapshots: {
        orderBy: [{ totalScore: "desc" }],
        take: 8,
      },
      mediaGroups: {
        orderBy: [{ totalScore: "desc" }],
        take: 5,
      },
    },
  });

  if (!scan) {
    throw new Error("Planner scan not found.");
  }

  const subredditLines = scan.subredditSnapshots.map(
    (row) => `r/${row.subreddit}: posts=${row.posts}, comments=${row.comments}, totalScore=${row.totalScore}, avgPost=${row.averagePostScore}`,
  );
  const postLines = scan.postSnapshots.map(
    (post) => `${post.score} score, ${post.numComments} comments, r/${post.subreddit}, ${post.contentType}: ${cleanText(post.title)}`,
  );
  const mediaLines = scan.mediaGroups.map(
    (group) => `${group.totalScore} score across ${group.postCount} posts; best r/${group.bestSubreddit ?? "unknown"}: ${cleanText(group.bestTitle ?? "unknown")}`,
  );

  const prompt = [
    "You are PaidPolitely's concise Reddit account planner.",
    "Use only this scan data. Do not invent subreddit rules. Recommend safe, platform-compliant post tests.",
    "Return JSON only, no markdown, no thinking text.",
    "Schema: {\"summary\":string,\"nextPost\":{\"subreddit\":string,\"title\":string,\"format\":string,\"timingUtc\":string,\"reason\":string},\"experiments\":string[],\"avoid\":string[],\"confidence\":\"low\"|\"medium\"|\"high\"}",
    `Account=u/${scan.account.username}`,
    `Source=${scan.source}`,
    `CapturedPosts=${scan.cleanedPostCount}`,
    `CapturedComments=${scan.cleanedCommentCount}`,
    `TotalPostScore=${scan.totalPostScore}`,
    `BestSubreddit=${scan.bestSubreddit ?? "unknown"}`,
    `BestHourUtc=${scan.bestPostingHourUtc === null ? "unknown" : `${scan.bestPostingHourUtc}:00`}`,
    "Subreddits:\n" + stringifyList(subredditLines),
    "TopPosts:\n" + stringifyList(postLines),
    "RepeatedMedia:\n" + stringifyList(mediaLines),
  ].join("\n\n");

  return truncate(prompt, plannerPromptMaxChars());
}

export async function enqueuePlannerJobForScan(scanId: string, ownerId?: string): Promise<PlannerJobSummary> {
  const existing = await prisma.plannerJob.findFirst({
    where: {
      scanId,
      ...(ownerId ? { account: { ownerUserId: ownerId } } : {}),
      status: {
        in: ["QUEUED", "RUNNING", "COMPLETED"],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) return toPlannerJobSummary(existing);

  const scan = await prisma.accountScan.findFirst({
    where: {
      id: scanId,
      ...(ownerId ? { account: { ownerUserId: ownerId } } : {}),
    },
    select: { accountId: true },
  });

  if (!scan) {
    throw new Error("Cannot enqueue planner job because the scan does not exist.");
  }

  const prompt = await buildPlannerPrompt(scanId, ownerId);
  const job = await prisma.plannerJob.create({
    data: {
      accountId: scan.accountId,
      scanId,
      prompt,
      status: "QUEUED",
    },
  });

  return toPlannerJobSummary(job);
}

function stripThinkingText(value: string): string {
  return value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function extractJsonObjectFromText(value: string): JsonObject {
  const cleaned = stripThinkingText(value);

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (isJsonObject(parsed)) return parsed;
  } catch {
    // Try loose extraction below.
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as unknown;
      if (isJsonObject(parsed)) return parsed;
    } catch {
      // Return raw output below.
    }
  }

  return { raw: cleaned };
}

async function requestPlannerCompletion(prompt: string, model: string): Promise<JsonObject> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), plannerTimeoutMs());

  try {
    const response = await fetch(`${ollamaBaseUrl()}/api/chat`, {
      method: "POST",
      cache: "no-store",
      headers: ollamaHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          {
            role: "system",
            content: "You are a fast JSON-only planner. Return one compact valid JSON object. Do not include markdown or reasoning.",
          },
          { role: "user", content: prompt },
        ],
        format: "json",
        options: {
          temperature: 0.25,
          top_p: 0.9,
          num_ctx: plannerNumCtx(),
          num_predict: plannerNumPredict(),
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Planner request failed: ${response.status} ${body.slice(0, 200)}`);
    }

    const payload = (await response.json()) as OllamaChatResponse;
    const content = payload.message?.content ?? payload.response ?? "";
    if (!content.trim()) throw new Error("Planner returned an empty response.");

    return extractJsonObjectFromText(content);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Planner request timed out after ${plannerTimeoutMs()}ms. Use a smaller OLLAMA_PLANNER_MODEL or local OLLAMA_BASE_URL.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function processNextPlannerJob(): Promise<ProcessPlannerJobResult> {
  const queued = await prisma.plannerJob.findFirst({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
  });

  if (!queued) return { processed: false, reason: "No queued planner jobs." };

  const claimed = await prisma.plannerJob.updateMany({
    where: { id: queued.id, status: "QUEUED" },
    data: {
      status: "RUNNING",
      lockedAt: new Date(),
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });

  if (claimed.count !== 1) return { processed: false, reason: "Queued planner job was claimed by another worker." };

  const running = await prisma.plannerJob.findUniqueOrThrow({ where: { id: queued.id } });

  try {
    const model = await resolvePlannerModel();
    const result = await requestPlannerCompletion(running.prompt, model);
    const completed = await prisma.plannerJob.update({
      where: { id: running.id },
      data: {
        status: "COMPLETED",
        model,
        result: toInputJson(result),
        error: null,
        completedAt: new Date(),
      },
    });

    return { processed: true, job: toPlannerJobSummary(completed) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Planner job failed.";
    const shouldFail = running.attempts >= 3;
    const failed = await prisma.plannerJob.update({
      where: { id: running.id },
      data: {
        status: shouldFail ? "FAILED" : "QUEUED",
        error: message,
        lockedAt: null,
        completedAt: shouldFail ? new Date() : null,
      },
    });

    return { processed: true, job: toPlannerJobSummary(failed) };
  }
}

export async function getPlannerJob(jobId: string, ownerId?: string): Promise<PlannerJobSummary | null> {
  const job = await prisma.plannerJob.findFirst({
    where: {
      id: jobId,
      ...(ownerId ? { account: { ownerUserId: ownerId } } : {}),
    },
  });
  return job ? toPlannerJobSummary(job) : null;
}
