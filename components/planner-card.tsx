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

function asText(value: unknown, fallback = "Not available yet."): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function asList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).filter(Boolean).slice(0, 5);
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
    const jobId = job.id;

    async function refresh() {
      const latestJob = await fetchPlannerJob(jobId);
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

  const result = job.result ?? null;
  const nextPost = typeof result?.nextPost === "object" && result.nextPost !== null ? (result.nextPost as Record<string, unknown>) : null;
  const experiments = asList(result?.experiments);
  const avoid = asList(result?.avoid);

  return (
    <section className={`${cardClass} analytics-section overflow-hidden p-5`} id="planner">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className={eyebrowClass}>AI planner</span>
          <h2 className="mt-2 mb-0 text-2xl font-extrabold tracking-[-0.03em] text-[var(--text)]">Strategy recommendation</h2>
        </div>
        <span className="status-pill">{job.status.toLowerCase()}</span>
      </div>

      {job.status === "QUEUED" || job.status === "RUNNING" ? (
        <div className="grid gap-2">
          <p className={`${mutedClass} leading-relaxed`}>This scan is saved and the persistent worker will process it. This card checks the saved job every few seconds.</p>
          {job.error ? <p className="text-sm text-[var(--issue)]">Last worker message: {job.error}</p> : null}
        </div>
      ) : null}

      {job.status === "FAILED" ? <p className="text-[var(--issue)]">{job.error ?? "Planner job failed."}</p> : null}

      {job.status === "COMPLETED" && result ? (
        <div className="grid gap-4">
          <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <p className="ui-eyebrow">Summary</p>
            <p className="mt-2 mb-0 leading-relaxed text-[var(--text)]">{asText(result.summary)}</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <p className="ui-eyebrow">Recommended next post</p>
              <h3 className="mt-2 mb-2 text-xl font-extrabold tracking-[-0.03em] text-[var(--text)]">{asText(nextPost?.title ?? nextPost?.angle ?? result.nextPost, "Next post test")}</h3>
              <p className="mb-0 leading-relaxed text-[var(--text-muted)]">{asText(nextPost?.reason ?? nextPost?.body ?? nextPost?.description, "Use the strongest subreddit, format, and timing signals from this scan.")}</p>
            </div>

            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <p className="ui-eyebrow">Confidence</p>
              <strong className="mt-3 block text-3xl font-extrabold text-[var(--text)]">{asText(result.confidence, "Medium")}</strong>
            </div>
          </div>

          {experiments.length > 0 ? (
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <p className="ui-eyebrow">Experiments</p>
              <ul className="mt-3 grid gap-2 pl-5 text-[var(--text)]">
                {experiments.map((item) => <li className="list-disc" key={item}>{item}</li>)}
              </ul>
            </div>
          ) : null}

          {avoid.length > 0 ? (
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <p className="ui-eyebrow">Avoid</p>
              <ul className="mt-3 grid gap-2 pl-5 text-[var(--text)]">
                {avoid.map((item) => <li className="list-disc" key={item}>{item}</li>)}
              </ul>
            </div>
          ) : null}

          <details className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <summary className="cursor-pointer font-extrabold text-[var(--text-muted)]">View raw planner output</summary>
            <pre className="mt-4 max-h-[420px] overflow-auto rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-relaxed text-[var(--text)]">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}
