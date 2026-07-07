"use client";

import { useEffect, useState } from "react";

import type { PlannerJobSummary } from "@/lib/types";
import { cardClass, eyebrowClass, mutedClass } from "@/lib/ui/styles";

type PlannerCardProps = {
  initialJob?: PlannerJobSummary | null;
};

type PlannerJobResponse = {
  job: PlannerJobSummary;
};

function isPlannerJobResponse(value: unknown): value is PlannerJobResponse {
  return typeof value === "object" && value !== null && "job" in value;
}

async function fetchPlannerJob(jobId: string): Promise<PlannerJobSummary | null> {
  const response = await fetch(`/api/planner/jobs?jobId=${encodeURIComponent(jobId)}&ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) return null;

  const payload = (await response.json()) as unknown;
  return isPlannerJobResponse(payload) ? payload.job : null;
}

export function PlannerCard({ initialJob }: PlannerCardProps) {
  const [job, setJob] = useState<PlannerJobSummary | null>(initialJob ?? null);

  useEffect(() => {
    setJob(initialJob ?? null);
  }, [initialJob]);

  useEffect(() => {
    if (!job || job.status === "COMPLETED" || job.status === "FAILED") return;

    let cancelled = false;

    async function refresh() {
      const latestJob = await fetchPlannerJob(job.id);
      if (!cancelled && latestJob) setJob(latestJob);
    }

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [job?.id, job?.status]);

  if (!job) return null;

  return (
    <section className={`${cardClass} overflow-hidden p-6`}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className={eyebrowClass}>AI planner</span>
          <h2 className="mt-2 mb-0 text-xl font-black tracking-[-0.03em]">Queued strategy recommendation</h2>
        </div>
        <span className="rounded-full border border-white/12 bg-white/[0.08] px-3 py-1 text-xs font-extrabold tracking-widest text-[#c9adbd] uppercase">
          {job.status.toLowerCase()}
        </span>
      </div>

      {job.status === "QUEUED" || job.status === "RUNNING" ? (
        <div className="grid gap-2">
          <p className={`${mutedClass} leading-relaxed`}>This scan is saved and the persistent worker will process it. This card checks the saved job every few seconds.</p>
          {job.error ? <p className="text-sm text-[#ffb6b6]">Last worker error: {job.error}</p> : null}
        </div>
      ) : null}

      {job.status === "FAILED" ? <p className="text-[#ffb6b6]">{job.error ?? "Planner job failed."}</p> : null}

      {job.status === "COMPLETED" && job.result ? (
        <pre className="mt-4 max-h-[520px] overflow-auto rounded-3xl border border-white/12 bg-black/20 p-4 text-sm leading-relaxed text-[#ffe6f0]">
          {JSON.stringify(job.result, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}
