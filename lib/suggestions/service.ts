import { randomUUID } from "node:crypto";

import type { PostSuggestion, Prisma } from "@prisma/client";
import { Ollama, type ChatResponse, type ListResponse } from "ollama";

import { getDashboardInsights } from "@/lib/analytics/dashboard-insights";
import { getHistoricalPerformance } from "@/lib/analytics/historical-performance";
import { prisma } from "@/lib/db/prisma";
import type { JsonObject, OllamaModelOption, PostSuggestionSummary, SuggestionStatus, SuggestionsResponse } from "@/lib/types";

const DEFAULT_OLLAMA_BASE_URL = "https://ollama.tik-track.com";
const DEFAULT_SUGGESTION_MODEL = "qwen3.6:27b";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_NUM_CTX = 8_192;
const DEFAULT_NUM_PREDICT = 650;
const MAX_PROMPT_CHARS = 18_000;
const COMPLETION_STATUSES = new Set(["COMPLETED", "FAILED"]);

type OllamaModel = NonNullable<ListResponse["models"]>[number];

type SuggestionContext = {
  account: {
    id: string;
    username: string;
    totalKarma: number;
    linkKarma: number;
    commentKarma: number;
    followerCount: number | null;
  };
  latestMetric: unknown;
  metricDeltas: {
    totalKarma7d: number | null;
    followers7d: number | null;
  };
  topSubreddits: Array<{ subreddit: string; posts: number; totalScore: number; averagePostScore: number; comments: number }>;
  topPosts: Array<{ title: string; subreddit: string; score: number; comments: number; views: number | null; createdAt: string }>;
  recentPosts: Array<{ title: string; subreddit: string; score: number; comments: number; views: number | null; createdAt: string }>;
  trackedSubreddits: string[];
  plannedPosts: Array<{ subreddit: string; title: string; status: string; plannedFor: string | null }>;
  previousSuggestions: Array<{ subreddit: string | null; title: string | null; model: string; createdAt: string }>;
  historicalSummary: unknown;
  dashboardSignals: unknown;
};

function ollamaBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL || process.env.NEXT_PUBLIC_OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, "");
}

function numericEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function suggestionTimeoutMs(): number {
  return numericEnv("SUGGESTION_OLLAMA_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
}

function suggestionNumCtx(): number {
  return numericEnv("SUGGESTION_OLLAMA_NUM_CTX", DEFAULT_NUM_CTX);
}

function suggestionNumPredict(): number {
  return numericEnv("SUGGESTION_OLLAMA_NUM_PREDICT", DEFAULT_NUM_PREDICT);
}

function ollamaClient(): Ollama {
  return new Ollama({ host: ollamaBaseUrl() });
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clean(value: string | null | undefined, maxLength = 240): string {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function parameterSizeB(value: string | undefined): number | null {
  const match = value?.toLowerCase().match(/([0-9]+(?:\.[0-9]+)?)b/);
  return match ? Number.parseFloat(match[1] ?? "0") : null;
}

function modelName(model: OllamaModel): string {
  return String(model.name || model.model || "").trim();
}

function capabilities(model: OllamaModel): string[] {
  const value = (model as unknown as { capabilities?: unknown }).capabilities;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function contextLength(model: OllamaModel): number | null {
  const value = (model.details as unknown as { context_length?: unknown } | undefined)?.context_length;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function modelSizeB(model: OllamaModel): number | null {
  const name = modelName(model);
  const nameMatch = name.toLowerCase().match(/(?:^|[^0-9])([0-9]+(?:\.[0-9]+)?)b(?:[^a-z]|$)/);
  return nameMatch ? Number.parseFloat(nameMatch[1] ?? "0") : parameterSizeB(model.details?.parameter_size);
}

function modelScore(model: OllamaModel): number {
  const name = modelName(model).toLowerCase();
  const modelCapabilities = capabilities(model).join(" ").toLowerCase();
  const size = modelSizeB(model);
  let score = 0;

  if (!/(completion|tools|thinking)/.test(modelCapabilities)) score -= 100_000;
  if (/embed|embedding/.test(name) || /embedding/.test(modelCapabilities)) score -= 100_000;
  if (/qwen3\.6:27b/.test(name)) score += 70_000;
  if (/qwen/.test(name)) score += 30_000;
  if (/gemma4:31b/.test(name)) score += 20_000;
  if (/deepseek/.test(name)) score += 14_000;
  if (/tools/.test(modelCapabilities)) score += 8_000;
  if (/thinking/.test(modelCapabilities)) score += 6_000;
  if (size !== null) score += Math.max(0, 32 - Math.abs(size - 24)) * 650;
  if (size !== null && size > 34) score -= 30_000;
  score += Math.min((contextLength(model) ?? 0) / 10_000, 30);

  return score;
}

function modelReason(model: OllamaModel, recommended: boolean): string {
  const size = modelSizeB(model);
  const details = model.details ?? {};
  if (recommended) return "Default pick: strong Qwen reasoning, large context, and Q4 size that should fit comfortably on a 24GB 5090 laptop.";
  if (/embed/i.test(modelName(model))) return "Embedding model; hidden from generation by default.";
  if (size !== null && size > 30) return "Large candidate; useful for comparison but may be slower or memory tight.";
  if (capabilities(model).includes("thinking")) return "Reasoning-capable model; good comparison candidate.";
  return "Available completion model.";
}

export async function listSuggestionModels(): Promise<{ defaultModel: string | null; models: OllamaModelOption[] }> {
  const response = await ollamaClient().list();
  const rawModels = (response.models ?? []).filter((model) => modelName(model));
  const completionModels = rawModels.filter((model) => capabilities(model).includes("completion"));
  const sorted = completionModels.sort((a, b) => modelScore(b) - modelScore(a));
  const defaultModel = sorted.find((model) => modelName(model) === DEFAULT_SUGGESTION_MODEL) ? DEFAULT_SUGGESTION_MODEL : modelName(sorted[0] ?? rawModels[0]);

  return {
    defaultModel: defaultModel || null,
    models: sorted.map((model) => {
      const name = modelName(model);
      return {
        name,
        parameterSize: model.details?.parameter_size ?? null,
        quantization: model.details?.quantization_level ?? null,
        sizeGb: typeof model.size === "number" ? Math.round((model.size / 1024 / 1024 / 1024) * 10) / 10 : null,
        contextLength: contextLength(model),
        capabilities: capabilities(model),
        recommended: name === defaultModel,
        reason: modelReason(model, name === defaultModel),
      };
    }),
  };
}

function stripThinkingText(value: string): string {
  return value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function parseSuggestionResponse(value: string): JsonObject {
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
      // Return raw below.
    }
  }

  return { raw: cleaned };
}

function rawTextFromResult(value: JsonObject): string | null {
  return typeof value.raw === "string" && value.raw.trim() ? value.raw.trim() : null;
}

function looseJsonFields(value: string): JsonObject {
  const fields: JsonObject = {};
  const matches = value.matchAll(/"([A-Za-z][A-Za-z0-9_]*)"\s*:\s*"((?:\\.|[^"\\])*)"/g);
  for (const match of matches) {
    const key = match[1];
    const rawValue = match[2];
    if (!key || rawValue === undefined) continue;
    try {
      fields[key] = JSON.parse(`"${rawValue}"`) as string;
    } catch {
      fields[key] = rawValue.replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
    }
  }
  return fields;
}

function escapedRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stringFromText(value: string, labels: string[], maxLength = 2000): string | null {
  for (const label of labels) {
    const labelPattern = escapedRegExp(label).replace(/\s+/g, "\\s+");
    const match = value.match(new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?(?:\\*\\*)?${labelPattern}(?:\\*\\*)?\\s*[:\\-]\\s*([^\\n]+)`, "i"));
    if (match?.[1]?.trim()) return clean(match[1], maxLength);
  }
  return null;
}

function firstUsefulLine(value: string): string | null {
  const line = value
    .split(/\r?\n/)
    .map((item) => item.replace(/^#+\s*/, "").replace(/^\*\*(.+)\*\*$/, "$1").trim())
    .find((item) => item && !/^(recommendation|next post|suggestion|analysis|rationale)$/i.test(item));
  return line ? clean(line, 240) : null;
}

function stringFromObject(value: JsonObject, keys: string[]): string | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return clean(candidate, 2000);
  }
  return null;
}

function nestedObject(value: JsonObject, key: string): JsonObject | null {
  const candidate = value[key];
  return isJsonObject(candidate) ? candidate : null;
}

function normaliseSuggestionResult(result: JsonObject): {
  subreddit: string | null;
  title: string | null;
  body: string | null;
  format: string | null;
  timing: string | null;
  rationale: string | null;
  confidence: string | null;
} {
  const looseFields = typeof result.raw === "string" ? looseJsonFields(result.raw) : null;
  const rawText = rawTextFromResult(result);
  const nextPost = nestedObject(result, "nextPost") ?? nestedObject(result, "suggestion") ?? looseFields ?? result;
  return {
    subreddit: (stringFromObject(nextPost, ["subreddit", "community", "targetSubreddit"]) ?? (rawText ? stringFromText(rawText, ["subreddit", "community", "target subreddit"]) : null))?.replace(/^r\//i, "") ?? null,
    title: stringFromObject(nextPost, ["title", "headline", "postTitle"]) ?? (rawText ? stringFromText(rawText, ["title", "post title", "headline"]) ?? firstUsefulLine(rawText) : null),
    body: stringFromObject(nextPost, ["body", "caption", "copy", "postBody", "description"]) ?? (rawText ? stringFromText(rawText, ["body", "caption", "copy", "post body", "post body/caption"]) : null),
    format: stringFromObject(nextPost, ["format", "type", "contentFormat"]) ?? (rawText ? stringFromText(rawText, ["format", "post format", "content format"], 120) : null),
    timing: stringFromObject(nextPost, ["timing", "timingUtc", "postAt", "recommendedTime"]) ?? (rawText ? stringFromText(rawText, ["timing", "best timing", "recommended time"], 240) : null),
    rationale: stringFromObject(nextPost, ["rationale", "reason", "why", "why this should work"]) ?? stringFromObject(result, ["rationale", "reason", "summary"]) ?? (rawText ? stringFromText(rawText, ["rationale", "why", "why this should work"], 2000) : null),
    confidence: stringFromObject(result, ["confidence"]) ?? stringFromObject(nextPost, ["confidence"]) ?? (rawText ? stringFromText(rawText, ["confidence"], 80) : null),
  };
}

function toSummary(row: PostSuggestion): PostSuggestionSummary {
  return {
    id: row.id,
    status: row.status as SuggestionStatus,
    model: row.model,
    requestGroup: row.requestGroup,
    subreddit: row.subreddit,
    title: row.title,
    body: row.body,
    format: row.format,
    timing: row.timing,
    rationale: row.rationale,
    confidence: row.confidence,
    error: row.error,
    result: isJsonObject(row.result) ? row.result : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export async function getSuggestions(ownerUserId: string): Promise<SuggestionsResponse> {
  const [modelData, rows] = await Promise.all([
    listSuggestionModels().catch(() => ({ defaultModel: null, models: [] })),
    prisma.postSuggestion.findMany({
      where: { ownerUserId, archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    defaultModel: modelData.defaultModel,
    models: modelData.models,
    suggestions: rows.map(toSummary),
  };
}

async function activeAccount(ownerUserId: string) {
  const setting = await prisma.workspaceSetting.findUnique({ where: { ownerUserId }, select: { activeAccountId: true } }).catch(() => null);
  return prisma.redditAccount.findFirst({
    where: {
      ownerUserId,
      ...(setting?.activeAccountId ? { id: setting.activeAccountId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, username: true, totalKarma: true, linkKarma: true, commentKarma: true, followerCount: true },
  });
}

async function buildSuggestionContext(ownerUserId: string): Promise<SuggestionContext> {
  const account = await activeAccount(ownerUserId);
  if (!account) throw new Error("Create or scan a Reddit account before generating suggestions.");

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [
    metrics,
    topSubreddits,
    topPosts,
    recentPosts,
    trackedSubreddits,
    plannedPosts,
    previousSuggestions,
    historical,
    dashboardSignals,
  ] = await Promise.all([
    prisma.accountMetricSnapshot.findMany({ where: { accountId: account.id }, orderBy: { capturedAt: "asc" }, take: 250 }),
    prisma.subredditSnapshot.groupBy({
      by: ["subreddit"],
      where: { accountId: account.id },
      _sum: { posts: true, totalScore: true, comments: true },
      _avg: { averagePostScore: true },
      orderBy: { _sum: { totalScore: "desc" } },
      take: 12,
    }),
    prisma.postSnapshot.findMany({
      where: { accountId: account.id },
      distinct: ["redditId"],
      orderBy: [{ score: "desc" }, { numComments: "desc" }],
      take: 16,
      select: { title: true, subreddit: true, score: true, numComments: true, latestViewCount: true, createdUtc: true },
    }),
    prisma.postSnapshot.findMany({
      where: { accountId: account.id, createdUtc: { gte: Math.floor(Date.now() / 1000) - 45 * 24 * 60 * 60 } },
      distinct: ["redditId"],
      orderBy: [{ createdUtc: "desc" }, { score: "desc" }],
      take: 20,
      select: { title: true, subreddit: true, score: true, numComments: true, latestViewCount: true, createdUtc: true },
    }),
    prisma.trackedSubreddit.findMany({ where: { ownerUserId, enabled: true }, orderBy: { subreddit: "asc" }, take: 20, select: { subreddit: true } }).catch(() => []),
    prisma.plannedPost.findMany({ where: { ownerUserId }, orderBy: { createdAt: "desc" }, take: 12, select: { subreddit: true, title: true, status: true, plannedFor: true } }).catch(() => []),
    prisma.postSuggestion.findMany({ where: { ownerUserId, status: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: 12, select: { subreddit: true, title: true, model: true, createdAt: true } }).catch(() => []),
    getHistoricalPerformance(ownerUserId, { preset: "90d" }).catch(() => null),
    getDashboardInsights(ownerUserId).catch(() => null),
  ]);

  const latestMetric = metrics.at(-1) ?? null;
  const weekStart = metrics.find((metric) => metric.capturedAt >= sevenDaysAgo) ?? metrics[0] ?? null;
  const latest = metrics.at(-1) ?? null;

  return {
    account: {
      id: account.id,
      username: account.username,
      totalKarma: account.totalKarma,
      linkKarma: account.linkKarma,
      commentKarma: account.commentKarma,
      followerCount: account.followerCount,
    },
    latestMetric,
    metricDeltas: {
      totalKarma7d: latest && weekStart ? latest.totalKarma - weekStart.totalKarma : null,
      followers7d: latest?.followerCount !== null && latest?.followerCount !== undefined && weekStart?.followerCount !== null && weekStart?.followerCount !== undefined ? latest.followerCount - weekStart.followerCount : null,
    },
    topSubreddits: topSubreddits.map((row) => ({
      subreddit: row.subreddit,
      posts: row._sum.posts ?? 0,
      totalScore: row._sum.totalScore ?? 0,
      averagePostScore: Math.round(row._avg.averagePostScore ?? 0),
      comments: row._sum.comments ?? 0,
    })),
    topPosts: topPosts.map((post) => ({
      title: clean(post.title),
      subreddit: post.subreddit,
      score: post.score,
      comments: post.numComments,
      views: post.latestViewCount,
      createdAt: new Date(post.createdUtc * 1000).toISOString(),
    })),
    recentPosts: recentPosts.map((post) => ({
      title: clean(post.title),
      subreddit: post.subreddit,
      score: post.score,
      comments: post.numComments,
      views: post.latestViewCount,
      createdAt: new Date(post.createdUtc * 1000).toISOString(),
    })),
    trackedSubreddits: trackedSubreddits.map((row) => row.subreddit),
    plannedPosts: plannedPosts.map((row) => ({
      subreddit: row.subreddit,
      title: clean(row.title),
      status: row.status,
      plannedFor: row.plannedFor?.toISOString() ?? null,
    })),
    previousSuggestions: previousSuggestions.map((row) => ({
      subreddit: row.subreddit,
      title: row.title,
      model: row.model,
      createdAt: row.createdAt.toISOString(),
    })),
    historicalSummary: historical?.summary ?? null,
    dashboardSignals,
  };
}

function buildPrompts(context: SuggestionContext): { systemPrompt: string; prompt: string } {
  const systemPrompt = [
    "You are PaidPolitely's Reddit growth strategist.",
    "Use account metrics, historical score/view movement, subreddit performance, recent posts, and saved plans to suggest exactly one next post.",
    "Write like a sharp strategist, not a data dumper: specific, practical, and concise.",
    "Stay platform-compliant and avoid explicit sexual instructions, harassment, vote manipulation, spam, or claims you cannot know.",
    "Do not output JSON. Do not include hidden reasoning. Give a plain-text recommendation the user can act on.",
  ].join(" ");
  const prompt = [
    "Generate one new post suggestion. It must not duplicate previous suggestions or already planned posts.",
    "Prefer a recommendation that connects observed performance to a concrete post idea.",
    "Use this loose plain-text shape, but do not force it if a more natural answer is clearer:",
    "Recommendation: one sentence strategy diagnosis",
    "Subreddit: r/example",
    "Title: suggested post title",
    "Post body/caption: short optional caption/body",
    "Format: image | text | question | progress_update | other",
    "Best timing: plain English timing recommendation",
    "Why this should work: two or three bullets tied to the metrics",
    "Risks/adjustments: one or two things to avoid",
    "Confidence: low | medium | high",
    `Account context: ${JSON.stringify(context)}`,
  ].join("\n\n");

  return { systemPrompt, prompt: prompt.length > MAX_PROMPT_CHARS ? `${prompt.slice(0, MAX_PROMPT_CHARS - 20)}\n...truncated...` : prompt };
}

export async function queueSuggestions(ownerUserId: string, models: string[]): Promise<PostSuggestionSummary[]> {
  const uniqueModels = [...new Set(models.map((model) => model.trim()).filter(Boolean))].slice(0, 8);
  if (uniqueModels.length === 0) throw new Error("Pick at least one model.");

  const context = await buildSuggestionContext(ownerUserId);
  const { prompt, systemPrompt } = buildPrompts(context);
  const requestGroup = randomUUID();
  const rows = await prisma.$transaction(uniqueModels.map((model) => prisma.postSuggestion.create({
    data: {
      ownerUserId,
      accountId: context.account.id,
      model,
      requestGroup,
      prompt,
      systemPrompt,
      context: asJson(context),
      status: "QUEUED",
    },
  })));

  return rows.map(toSummary);
}

async function requestSuggestionCompletion(job: PostSuggestion): Promise<JsonObject> {
  const client = ollamaClient();
  const timeout = setTimeout(() => client.abort(), suggestionTimeoutMs());

  try {
    const response = await client.chat({
      model: job.model,
      stream: false,
      think: false,
      messages: [
        { role: "system", content: job.systemPrompt },
        { role: "user", content: job.prompt },
      ],
      options: {
        temperature: 0.55,
        top_p: 0.9,
        num_ctx: suggestionNumCtx(),
        num_predict: suggestionNumPredict(),
        repeat_penalty: 1.08,
      },
    }) as ChatResponse;
    const content = response.message?.content ?? "";
    if (!content.trim()) throw new Error("Ollama returned an empty suggestion.");
    return parseSuggestionResponse(content);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Suggestion generation timed out after ${suggestionTimeoutMs()}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function processNextSuggestion(ownerUserId: string): Promise<{ processed: boolean; suggestion?: PostSuggestionSummary; reason?: string }> {
  const staleCutoff = new Date(Date.now() - 15 * 60 * 1000);
  await prisma.postSuggestion.updateMany({
    where: { ownerUserId, status: "RUNNING", lockedAt: { lt: staleCutoff } },
    data: { status: "QUEUED", lockedAt: null, error: "Recovered stale suggestion generation." },
  });

  const queued = await prisma.postSuggestion.findFirst({
    where: { ownerUserId, status: "QUEUED" },
    orderBy: { createdAt: "asc" },
  });
  if (!queued) return { processed: false, reason: "No queued suggestions." };

  const claimed = await prisma.postSuggestion.updateMany({
    where: { id: queued.id, ownerUserId, status: "QUEUED" },
    data: { status: "RUNNING", lockedAt: new Date(), startedAt: new Date(), attempts: { increment: 1 }, error: null },
  });
  if (claimed.count !== 1) return { processed: false, reason: "Suggestion was claimed elsewhere." };

  const running = await prisma.postSuggestion.findUniqueOrThrow({ where: { id: queued.id } });

  try {
    const result = await requestSuggestionCompletion(running);
    const normalized = normaliseSuggestionResult(result);
    if (!normalized.title && !normalized.subreddit && !normalized.rationale && !rawTextFromResult(result)) {
      throw new Error("Ollama returned a suggestion without usable post fields.");
    }
    const completed = await prisma.postSuggestion.update({
      where: { id: running.id },
      data: {
        status: "COMPLETED",
        result: asJson(result),
        ...normalized,
        error: null,
        lockedAt: null,
        completedAt: new Date(),
      },
    });
    return { processed: true, suggestion: toSummary(completed) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suggestion generation failed.";
    const nextStatus = running.attempts >= 2 ? "FAILED" : "QUEUED";
    const failed = await prisma.postSuggestion.update({
      where: { id: running.id },
      data: {
        status: nextStatus,
        error: message,
        lockedAt: null,
        completedAt: COMPLETION_STATUSES.has(nextStatus) ? new Date() : null,
      },
    });
    return { processed: true, suggestion: toSummary(failed) };
  }
}
