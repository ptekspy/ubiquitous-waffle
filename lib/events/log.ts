import { randomUUID } from "crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

type EventSeverity = "info" | "warn" | "error";

export type EventLogInput = {
  ownerUserId?: string | null;
  accountId?: string | null;
  scanId?: string | null;
  jobId?: string | null;
  type: string;
  severity?: EventSeverity;
  message: string;
  metadata?: Prisma.InputJsonValue | null;
};

export async function logEvent(input: EventLogInput): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO "EventLog" ("id", "ownerUserId", "accountId", "scanId", "jobId", "type", "severity", "message", "metadata")
      VALUES (${randomUUID()}, ${input.ownerUserId ?? null}, ${input.accountId ?? null}, ${input.scanId ?? null}, ${input.jobId ?? null}, ${input.type}, ${input.severity ?? "info"}, ${input.message}, ${input.metadata ? JSON.stringify(input.metadata) : null}::jsonb)
    `;
  } catch (error) {
    console.warn("Unable to write EventLog row", error);
  }
}
