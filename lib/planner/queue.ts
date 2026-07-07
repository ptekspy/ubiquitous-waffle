import type { PlannerJobStatus as PrismaPlannerJobStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { JsonObject, PlannerJobStatus, PlannerJobSummary } from "@/lib/types";

const DEFAULT_OLLAMA_BASE_URL = "https://ollama.tik-track.com";
const PLANNER_MODEL_KEYWORDS = [
  "qwen3.6",
  "qwen3",
  "qwen2.5",
  "qwen",
  "dolphin",
  "nous",
  "hermes",
  "llama3.3",
  "llama3.2",
  "llama3.1",
  "mistral-nemo",
  "mistral",
  "gemma4",
  "gemma3",
  "gemma2",
];
const PLANNER_MODEL_PENALTIES = ["embed", "embedding", "clip", "code", "coder"];
const PLANNER_MODEL_BOOSTS = [
  { keyword: "hauhaucs", score: 100_000 },
  { keyword: "uncensored", score: 90_000 },
  { keyword: "abliterated", score: 70_000 },
  { keyword: "aggressive", score: 50_000 },
  { keyword: "qwen3.6-27b", score: 25_000 },
  { keyword: "qwen3.6:27b", score: 20_000 },
  { keyword: "tools", score: 2_000 },
  { keyword: "thinking", score: 1_500 },
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

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parameterSizeScore(value: string | undefined): number {
  const match = value?.toLowerCase().match(/([0-9]+(?:\.[0-9]+)?)b/);
  return match ? Number.parseFloat(match[1] ?? "0") * 100 : 0;
}

function modelKeywordScore(model: OllamaModel): number {
  const name = model.name ?? model.model ?? "";
  const lowerName = name.toLowerCase();
  const lowerCapabilities = (model.capabilities ?? []).join(" ").toLowerCase();
  const keywordIndex = PLANNER_MODEL_KEYWORDS.findIndex((keyword) => lowerName.includes(keyword));
  const keywordScore = keywordIndex === -1 ? 0 : (PLANNER_MODEL_KEYWORDS.length - keywordIndex) * 1_000;
  const penalty = PLANNER_MODEL_PENALTIES.some((keyword) => lowerName.includes(keyword)) ? 25_000 : 0;
  const boostScore = PLANNER_MODEL_BOOSTS.reduce((sum, boost) => {
    const haystack = `${lowerName} ${lowerCapabilities}`;
    return haystack.includes(boost.keyword) ? sum + boost.score : sum;
  }, 0);
  const sizeMatch = lowerName.match(/(?:^|[^0-9])([0-9]+(?:\.[0-9]+)?)b(?:[^a-z]|$)/);
  const nameSizeScore = sizeMatch ? Number.parseFloat(sizeMatch[1] ?? "0") * 100 : 0;
  const detailSizeScore = parameterSizeScore(model.details?.parameter_size);
  const contextScore = Math.min((model.details?.context_length ?? 0) / 10_000, 50);

  return keywordScore + boostScore + Math.max(nameSizeScore, detailSizeScore) + contextScore - penalty;
}

function choosePlannerModel(models: OllamaModel[]): string | null {
  const candidates = models
    .map((model) => ({ name: model.name?.trim() ?? model.model?.trim() ?? "", score: modelKeywordScore(model), size: model.size ?? 0 }))
    .filter((model) => model.name.length > 0)
    .sort((a, b) => b.score - a.score || b.size - a.size || a.name.localeCompare(b.name));

  return candidates[0]?.name ?? null;
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
        take: 20,
      },
      subredditSnapshots: {
        orderBy: [{ totalScore: "desc" }],
        take: 20,
      },
      mediaGroups: {
        orderBy: [{ totalScore: "desc" }],
        take: 12,
      },
    },
  });

  if (!scan) {
    throw new Error("Planner scan not found.");
  }

  const subredditLines = scan.subredditSnapshots.map(
    (row) => `- r/${row.subreddit}: ${row.posts} posts, ${row.comments} comments, ${row.totalScore} total score, ${row.averagePostScore} avg post score`,
  );
  const postLines = scan.postSnapshots.map(
    (post) => `- ${post.score} score / ${post.numComments} comments / r/${post.subreddit} / ${post.contentType}: ${post.title}`,
  );
  const mediaLines = scan.mediaGroups.map(
    (group) => `- ${group.totalScore} total score across ${group.postCount} posts; best r/${group.bestSubreddit ?? "unknown"}; title: ${group.bestTitle ?? "unknown"}`,
  );

  return [
    "You are the PaidPolitely next item planner for a Reddit creator account.",
    "Use the scan data to suggest the next safe, platform-compliant Reddit post tests.",
    "Return valid JSON only with: summary, nextPost, experiments, avoid, confidence.",
    `Account: u/${scan.account.username}`,
    `Scan source: ${scan.source}`,
    `Captured posts: ${scan.cleanedPostCount}`,
    `Captured comments: ${scan.cleanedCommentCount}`,
    `Total post score: ${scan.totalPostScore}`,
    `Best subreddit: ${scan.bestSubreddit ?? "unknown"}`,
    `Best UTC hour: ${scan.bestPostingHourUtc === null ? "unknown" : `${scan.bestPostingHourUtc}:00`}`,
    "Subreddit performance:",
    stringifyList(subredditLines),
    "Top posts:",
    stringifyList(postLines),
    "Repeated media groups:",
    stringifyList(mediaLines),
  ].join("\n\n");
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

function extractJsonObjectFromText(value: string): JsonObject {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (isJsonObject(parsed)) return parsed;
  } catch {
    // Try loose extraction below.
  }

  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(value.slice(firstBrace, lastBrace + 1)) as unknown;
      if (isJsonObject(parsed)) return parsed;
    } catch {
      // Return raw output below.
    }
  }

  return { raw: value };
}

async function requestPlannerCompletion(prompt: string, model: string): Promise<JsonObject> {
  const response = await fetch(`${ollamaBaseUrl()}/api/chat`, {
    method: "POST",
    cache: "no-store",
    headers: ollamaHeaders(),
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: "system", content: "Return valid JSON only." },
        { role: "user", content: prompt },
      ],
      options: { temperature: 0.7 },
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
