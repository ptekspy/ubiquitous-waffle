import type { PlannerJobStatus as PrismaPlannerJobStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { JsonObject, PlannerJobStatus, PlannerJobSummary } from "@/lib/types";

const DEFAULT_OLLAMA_BASE_URL = "https://ollama.tik-track.com";

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
