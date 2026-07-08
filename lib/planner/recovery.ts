import { prisma } from "@/lib/db/prisma";

const DEFAULT_PLANNER_STALE_LOCK_MS = 15 * 60 * 1000;

function numericEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function staleLockCutoff(): Date {
  return new Date(Date.now() - numericEnv("PLANNER_STALE_LOCK_MS", DEFAULT_PLANNER_STALE_LOCK_MS));
}

export async function recoverStalePlannerJobs(): Promise<number> {
  const recovered = await prisma.plannerJob.updateMany({
    where: {
      status: "RUNNING",
      lockedAt: {
        lt: staleLockCutoff(),
      },
    },
    data: {
      status: "QUEUED",
      lockedAt: null,
      startedAt: null,
      error: "Recovered stale RUNNING planner job.",
    },
  });

  return recovered.count;
}
