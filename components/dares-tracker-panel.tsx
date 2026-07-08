"use client";

import { useEffect, useState } from "react";

import type { DareTrackerResponse } from "@/lib/dares/tracker";
import { cardClass, mutedClass } from "@/lib/ui/styles";
import { compactNumber } from "@/utils/compact-number";

type LoadState = "idle" | "loading" | "loaded" | "error";

async function fetchTracker(): Promise<DareTrackerResponse> {
  const response = await fetch(`/api/dares/tracker?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load dares tracker.");
  return (await response.json()) as DareTrackerResponse;
}

async function updateCompletion(id: string, status: "PENDING" | "VERIFIED" | "REJECTED"): Promise<DareTrackerResponse> {
  const response = await fetch("/api/dares/tracker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error || "Unable to update dare completion.");
  return payload as DareTrackerResponse;
}

function dateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function statusClass(value: string): string {
  if (value === "VERIFIED") return "status-pill status-panel--ok";
  if (value === "REJECTED") return "status-pill status-panel--off";
  if (value === "PENDING") return "status-pill status-panel--wait";
  return "status-pill";
}

function typeLabel(value: string): string {
  return value === "COMMUNITY" ? "Community" : "Playbook";
}

export function DaresTrackerPanel() {
  const [state, setState] = useState<LoadState>("idle");
  const [data, setData] = useState<DareTrackerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setState("loading");
    setError(null);
    try {
      const result = await fetchTracker();
      setData(result);
      setState("loaded");
    } catch (loadError) {
      setState("error");
      setError(loadError instanceof Error ? loadError.message : "Unable to load dares tracker.");
    }
  }

  async function review(id: string, status: "PENDING" | "VERIFIED" | "REJECTED") {
    setBusyId(id);
    setError(null);
    try {
      const result = await updateCompletion(id, status);
      setData(result);
      setState("loaded");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update dare completion.");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (state === "loaded" && data && !data.account) return null;

  return (
    <section className={`${cardClass} overflow-hidden p-5`} id="dares">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <span className="ui-eyebrow">r/daresgonewild</span>
          <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Dares tracker</h2>
          <p className={mutedClass}>Detects r/daresgonewild playbook and community completions from scanned posts, then lets you review them locally.</p>
        </div>
        <button className="rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface-muted)] px-4 py-2 text-sm font-extrabold text-[var(--accent-strong)]" type="button" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {state === "loading" ? <p className={mutedClass}>Loading dares tracker…</p> : null}
      {error ? <p className="text-[var(--issue)]">{error}</p> : null}

      {data ? (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4"><span className="text-sm text-[var(--text-muted)]">Detected</span><strong className="mt-1 block text-3xl text-[var(--text)]">{compactNumber(data.summary.detected)}</strong></div>
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4"><span className="text-sm text-[var(--text-muted)]">Pending</span><strong className="mt-1 block text-3xl text-[var(--text)]">{compactNumber(data.summary.pending)}</strong></div>
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4"><span className="text-sm text-[var(--text-muted)]">Verified</span><strong className="mt-1 block text-3xl text-[var(--text)]">{compactNumber(data.summary.verified)}</strong></div>
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4"><span className="text-sm text-[var(--text-muted)]">Rejected</span><strong className="mt-1 block text-3xl text-[var(--text)]">{compactNumber(data.summary.rejected)}</strong></div>
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4"><span className="text-sm text-[var(--text-muted)]">Community</span><strong className="mt-1 block text-3xl text-[var(--text)]">{compactNumber(data.summary.community)}</strong></div>
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4"><span className="text-sm text-[var(--text-muted)]">Playbook</span><strong className="mt-1 block text-3xl text-[var(--text)]">{data.summary.completionPercent}%</strong></div>
          </div>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <h3 className="mb-3 text-xl font-extrabold text-[var(--text)]">Level progress</h3>
              <div className="grid gap-3">
                {data.levels.map((level) => (
                  <div key={level.level}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <strong className="text-[var(--text)]">{level.label}</strong>
                      <span className="text-[var(--text-muted)]">{level.verified}/{level.total} verified · {level.pending} pending</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${level.completionPercent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <h3 className="mb-3 text-xl font-extrabold text-[var(--text)]">Pending review</h3>
              {data.pending.length === 0 ? <p className={mutedClass}>No pending dare detections yet.</p> : null}
              <div className="grid gap-3">
                {data.pending.map((completion) => (
                  <article className="rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-4" key={completion.id}>
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <strong className="block text-[var(--text)]">{completion.dareName ?? "Community dare"}</strong>
                        <a className="text-sm font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline" href={completion.post.permalink} target="_blank" rel="noreferrer">{completion.post.title}</a>
                      </div>
                      <span className={statusClass(completion.status)}>{typeLabel(completion.type)}</span>
                    </div>
                    <p className="mb-3 text-sm text-[var(--text-muted)]">r/{completion.post.subreddit} · {dateTime(completion.detectedAt)} · {Math.round(completion.confidence * 100)}% confidence · {compactNumber(completion.post.score)} score / {compactNumber(completion.post.comments)} comments</p>
                    <div className="flex flex-wrap gap-2">
                      <button disabled={busyId === completion.id} className="rounded-[12px] bg-[var(--ok)] px-3 py-2 text-sm font-extrabold text-white disabled:opacity-50" type="button" onClick={() => void review(completion.id, "VERIFIED")}>Verify</button>
                      <button disabled={busyId === completion.id} className="rounded-[12px] bg-[var(--issue)] px-3 py-2 text-sm font-extrabold text-white disabled:opacity-50" type="button" onClick={() => void review(completion.id, "REJECTED")}>Reject</button>
                    </div>
                  </article>
                ))}
              </div>
            </article>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <h3 className="mb-3 text-xl font-extrabold text-[var(--text)]">Playbook catalogue</h3>
              <div className="grid max-h-[520px] gap-2 overflow-y-auto pr-1">
                {data.catalogue.map((dare) => (
                  <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-3" key={dare.slug}>
                    <div>
                      <strong className="text-[var(--text)]">{dare.emoji} {dare.name}</strong>
                      <small className="mt-1 block text-[var(--text-muted)]">{dare.requirements.join(" · ")}</small>
                    </div>
                    <span className={statusClass(dare.status)}>{dare.status === "NOT_STARTED" ? "todo" : dare.status.toLowerCase()}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <h3 className="mb-3 text-xl font-extrabold text-[var(--text)]">Recent detections</h3>
              {data.recent.length === 0 ? <p className={mutedClass}>No dare detections yet. Scan the profile after posting in r/daresgonewild.</p> : null}
              <div className="grid gap-2">
                {data.recent.map((completion) => (
                  <a className="block rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-3 underline-offset-4 hover:underline" href={completion.post.permalink} target="_blank" rel="noreferrer" key={completion.id}>
                    <div className="flex items-start justify-between gap-3">
                      <strong className="text-[var(--text)]">{completion.dareName ?? "Community dare"}</strong>
                      <span className={statusClass(completion.status)}>{completion.status.toLowerCase()}</span>
                    </div>
                    <small className="mt-1 block text-[var(--text-muted)]">{dateTime(completion.detectedAt)} · {completion.post.title}</small>
                  </a>
                ))}
              </div>
            </article>
          </section>
        </div>
      ) : null}
    </section>
  );
}
