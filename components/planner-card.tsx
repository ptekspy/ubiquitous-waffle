"use client";

import { useEffect, useState } from "react";

import { plannerAvoidList, plannerExperiments, plannerNextPost, plannerSummary } from "@/lib/planner/result";
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

export function PlannerCard({ initialJob }: PlannerCardProps) {
  const [job, setJob] = useState<PlannerJobSummary | null>(initialJob ?? null);

  useEffect(() => {
    if (!job || job.status === "COMPLETED" || job.status === "FAILED") return;

    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/planner/jobs?jobId=${encodeURIComponent(job.id)}`);
      if (!response.ok) return;

      const payload = (await response.json()) as unknown;
      if (isPlannerJobResponse(payload)) setJob(payload.job);
    }, 4000);

    return () => window.clearInterval(interval);
  }, [job]);

  if (!job) return null;

  const summary = plannerSummary(job.result);
  const nextPost = plannerNextPost(job.result);
  const experiments = plannerExperiments(job.result);
  const avoid = plannerAvoidList(job.result);

  return (
    <section className={`${cardClass} overflow-hidden p-6`}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className={eyebrowClass}>AI next-post planner</span>
          <h2 className="mt-2 mb-0 text-xl font-black tracking-[-0.03em]">Queued strategy recommendation</h2>
        </div>
        <span className="rounded-full border border-white/12 bg-white/[0.08] px-3 py-1 text-xs font-extrabold tracking-widest text-[#c9adbd] uppercase">
          {job.status.toLowerCase()}
        </span>
      </div>

      {job.status === "QUEUED" || job.status === "RUNNING" ? (
        <p className={`${mutedClass} leading-relaxed`}>
          This scan is saved and the planner job is queued. Run the queue processor to call Ollama and this card will update when the result is saved.
        </p>
      ) : null}

      {job.status === "FAILED" ? <p className="text-[#ffb6b6]">{job.error ?? "Planner job failed."}</p> : null}

      {summary ? <p className={`${mutedClass} mb-5 leading-relaxed`}>{summary}</p> : null}

      {nextPost ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
          <div className="rounded-3xl border border-white/12 bg-white/[0.05] p-4">
            <strong className="mb-2 block text-lg">{nextPost.theme || "Recommended next test"}</strong>
            <dl className="grid gap-2 text-sm text-[#c9adbd]">
              <div><dt className="font-extrabold text-[#ffe6f0]">Primary subreddit</dt><dd>{nextPost.primarySubreddit || "Not specified"}</dd></div>
              <div><dt className="font-extrabold text-[#ffe6f0]">Secondary subreddits</dt><dd>{nextPost.secondarySubreddits.join(", ") || "Not specified"}</dd></div>
              <div><dt className="font-extrabold text-[#ffe6f0]">Format</dt><dd>{nextPost.format || "Not specified"}</dd></div>
              <div><dt className="font-extrabold text-[#ffe6f0]">Posting window UTC</dt><dd>{nextPost.postingWindowUtc || "Not specified"}</dd></div>
            </dl>
          </div>

          <div className="rounded-3xl border border-white/12 bg-white/[0.05] p-4">
            <strong className="mb-2 block text-lg">Title drafts</strong>
            <ul className="grid gap-2 pl-5 text-sm text-[#c9adbd]">
              {nextPost.titleDrafts.map((title) => <li className="list-disc" key={title}>{title}</li>)}
            </ul>
          </div>
        </div>
      ) : null}

      {experiments.length > 0 ? (
        <div className="mt-4 rounded-3xl border border-white/12 bg-white/[0.05] p-4">
          <strong className="mb-2 block text-lg">Experiments</strong>
          <div className="grid gap-3">
            {experiments.map((experiment) => (
              <article className="rounded-2xl bg-black/15 p-3" key={`${experiment.name}-${experiment.titleAngle}`}>
                <strong className="block">{experiment.name}</strong>
                <small className="block text-[#c9adbd]">{experiment.subreddits.join(", ")}</small>
                <p className="mt-2 text-sm text-[#c9adbd]">{experiment.titleAngle}</p>
                <p className="mt-1 text-xs font-extrabold tracking-widest text-[#ffb86b] uppercase">{experiment.successMetric}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {avoid.length > 0 ? (
        <div className="mt-4 rounded-3xl border border-[#ffb86b]/30 bg-[#ffb86b]/[0.08] p-4">
          <strong className="mb-2 block text-[#ffe7c9]">Avoid / watch</strong>
          <ul className="grid gap-1.5 pl-5 text-sm text-[#ffe7c9]">
            {avoid.map((item) => <li className="list-disc" key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
