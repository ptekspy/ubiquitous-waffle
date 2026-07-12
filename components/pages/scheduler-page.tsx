"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ErrorCard } from "@/components/error-card";
import { useDashboardRuntime } from "@/components/dashboard-runtime-provider";
import { sendExtensionMessage } from "@/lib/extension/client";
import type { ExtensionSubredditFlairsResponse } from "@/lib/extension/types";
import type { ScheduledDraftSummary, SchedulerResponse, SubredditFlairOption } from "@/lib/types";
import { cardClass, inputClass, mutedClass, primaryButtonClass } from "@/lib/ui/styles";

type LoadState = "idle" | "loading" | "loaded" | "error";

type DraftForm = {
  community: string;
  title: string;
  body: string;
  imageUrl: string;
  videoUrl: string;
  flairId: string;
  plannedFor: string;
  notes: string;
};

const emptyForm: DraftForm = {
  community: "u/MrMrsHK",
  title: "",
  body: "",
  imageUrl: "",
  videoUrl: "",
  flairId: "",
  plannedFor: "",
  notes: "",
};

const secondaryButtonClass = "rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm font-extrabold text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50";
const textareaClass = `${inputClass} resize-y`;

function isProfileCommunity(value: string): boolean {
  return /^u\/[A-Za-z0-9_-]{3,20}$/i.test(value.trim());
}

function subredditName(value: string): string {
  return value.trim().replace(/^r\//i, "").replace(/^\/?r\//i, "").split(/[/?#]/)[0];
}

function dateTime(value: string | null | undefined): string {
  if (!value) return "Unscheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T | { error?: string };
  if (!response.ok) throw new Error(typeof payload === "object" && payload && "error" in payload && payload.error ? payload.error : "Request failed.");
  return payload as T;
}

async function fetchScheduler(): Promise<SchedulerResponse> {
  const response = await fetch(`/api/scheduler?ts=${Date.now()}`, { cache: "no-store" });
  return readJson<SchedulerResponse>(response);
}

async function saveDraft(form: DraftForm, flair: SubredditFlairOption | null): Promise<ScheduledDraftSummary> {
  const response = await fetch("/api/scheduler", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...form,
      flairText: flair?.text ?? null,
    }),
  });
  const payload = await readJson<{ draft: ScheduledDraftSummary }>(response);
  return payload.draft;
}

function DraftCard({ draft }: { draft: ScheduledDraftSummary }) {
  return (
    <article className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="ui-eyebrow">{draft.community.startsWith("u/") ? draft.community : `r/${draft.community}`}</span>
          <h3 className="mt-2 mb-1 text-lg font-extrabold text-[var(--text)]">{draft.title}</h3>
          <p className="m-0 text-sm text-[var(--text-muted)]">{dateTime(draft.plannedFor)} · {draft.format}</p>
        </div>
        <span className="status-pill status-panel--wait">{draft.status.toLowerCase()}</span>
      </div>
      {draft.body ? <p className="text-sm leading-relaxed text-[var(--text)]">{draft.body}</p> : null}
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {draft.flairText ? <div><dt className="font-extrabold text-[var(--text-muted)]">Flair</dt><dd className="m-0 text-[var(--text)]">{draft.flairText}</dd></div> : null}
        {draft.imageUrl ? <div><dt className="font-extrabold text-[var(--text-muted)]">Image</dt><dd className="m-0 break-all text-[var(--text)]">{draft.imageUrl}</dd></div> : null}
        {draft.videoUrl ? <div><dt className="font-extrabold text-[var(--text-muted)]">Redgifs</dt><dd className="m-0 break-all text-[var(--text)]">{draft.videoUrl}</dd></div> : null}
        {draft.notes ? <div><dt className="font-extrabold text-[var(--text-muted)]">Notes</dt><dd className="m-0 text-[var(--text)]">{draft.notes}</dd></div> : null}
      </dl>
    </article>
  );
}

export function SchedulerPage() {
  const runtime = useDashboardRuntime();
  const [state, setState] = useState<LoadState>("idle");
  const [payload, setPayload] = useState<SchedulerResponse | null>(null);
  const [form, setForm] = useState<DraftForm>(emptyForm);
  const [flairs, setFlairs] = useState<SubredditFlairOption[]>([]);
  const [flairState, setFlairState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedFlair = useMemo(() => flairs.find((flair) => flair.id === form.flairId) ?? null, [flairs, form.flairId]);
  const isProfile = isProfileCommunity(form.community);
  const canSave = form.title.trim().length > 0 && form.community.trim().length > 0 && !saving;

  const load = useCallback(async () => {
    setState((current) => current === "idle" ? "loading" : current);
    setError(null);
    try {
      const data = await fetchScheduler();
      setPayload(data);
      setForm((current) => current.community === emptyForm.community ? { ...current, community: data.defaultCommunity } : current);
      setState("loaded");
    } catch (loadError) {
      setState("error");
      setError(loadError instanceof Error ? loadError.message : "Unable to load scheduler.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const community = form.community.trim();
    if (!community || isProfileCommunity(community)) {
      setFlairs([]);
      setFlairState("idle");
      setForm((current) => current.flairId ? { ...current, flairId: "" } : current);
      return;
    }

    async function loadFlairs() {
      setFlairState("loading");
      try {
        const response = await sendExtensionMessage<ExtensionSubredditFlairsResponse>({
          type: "PAIDPOLITELY_FETCH_SUBREDDIT_FLAIRS",
          subreddit: subredditName(community),
        }, 15000);
        if (cancelled) return;
        if (!response.ok) throw new Error(response.error);
        setFlairs(response.flairs);
        setFlairState("loaded");
      } catch (flairError) {
        if (cancelled) return;
        setFlairs([]);
        setFlairState("error");
        setError(flairError instanceof Error ? flairError.message : "Unable to load subreddit flairs.");
      }
    }

    const timer = window.setTimeout(() => void loadFlairs(), 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.community]);

  function update<K extends keyof DraftForm>(key: K, value: DraftForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await saveDraft(form, selectedFlair);
      setForm((current) => ({ ...emptyForm, community: current.community || payload?.defaultCommunity || emptyForm.community }));
      setFlairs([]);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save draft.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {runtime.error ? <ErrorCard message={runtime.error} /> : null}
      {error ? <ErrorCard message={error} /> : null}

      <section className={`${cardClass} mb-4 p-5`}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="ui-eyebrow">Post scheduler</span>
            <h2 className="mt-2 mb-1 text-2xl font-extrabold text-[var(--text)]">Draft queue</h2>
            <p className={mutedClass}>Draft-only. The extension is used for subreddit flair lookup, not publishing.</p>
          </div>
          <button className={secondaryButtonClass} type="button" onClick={() => void load()} disabled={state === "loading"}>{state === "loading" ? "Refreshing..." : "Refresh"}</button>
        </div>

        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <label className="grid gap-2 text-sm font-extrabold text-[var(--text)]">
              Community
              <input className={inputClass} list="scheduler-communities" value={form.community} onChange={(event) => update("community", event.target.value)} placeholder="u/MrMrsHK or r/subreddit" autoComplete="off" />
              <datalist id="scheduler-communities">
                {(payload?.communities ?? []).map((community) => <option key={community} value={community.startsWith("u/") ? community : `r/${community}`} />)}
              </datalist>
            </label>
            <label className="grid gap-2 text-sm font-extrabold text-[var(--text)]">
              Schedule
              <input className={inputClass} type="datetime-local" value={form.plannedFor} onChange={(event) => update("plannedFor", event.target.value)} />
            </label>
          </div>

          {!isProfile ? (
            <label className="grid gap-2 text-sm font-extrabold text-[var(--text)]">
              Flair
              <select className={inputClass} value={form.flairId} onChange={(event) => update("flairId", event.target.value)} disabled={flairState === "loading"}>
                <option value="">{flairState === "loading" ? "Loading flairs..." : "No flair"}</option>
                {flairs.map((flair) => <option key={flair.id} value={flair.id}>{flair.text}{flair.editable ? " (editable)" : ""}</option>)}
              </select>
            </label>
          ) : null}

          <label className="grid gap-2 text-sm font-extrabold text-[var(--text)]">
            Title
            <input className={inputClass} value={form.title} onChange={(event) => update("title", event.target.value)} maxLength={300} required />
          </label>

          <label className="grid gap-2 text-sm font-extrabold text-[var(--text)]">
            Body
            <textarea className={`${textareaClass} min-h-[150px]`} value={form.body} onChange={(event) => update("body", event.target.value)} />
          </label>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="grid gap-2 text-sm font-extrabold text-[var(--text)]">
              Image URL
              <input className={inputClass} type="url" value={form.imageUrl} onChange={(event) => update("imageUrl", event.target.value)} disabled={Boolean(form.videoUrl)} placeholder="https://..." />
            </label>
            <label className="grid gap-2 text-sm font-extrabold text-[var(--text)]">
              Redgifs link
              <input className={inputClass} type="url" value={form.videoUrl} onChange={(event) => update("videoUrl", event.target.value)} disabled={Boolean(form.imageUrl)} placeholder="https://www.redgifs.com/..." />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-extrabold text-[var(--text)]">
            Notes
            <textarea className={textareaClass} value={form.notes} onChange={(event) => update("notes", event.target.value)} />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button className={primaryButtonClass} type="submit" disabled={!canSave}>{saving ? "Saving..." : "Save draft"}</button>
            <span className={mutedClass}>{runtime.extensionState === "installed" ? "Extension ready" : "Extension not ready for flair lookup"}</span>
          </div>
        </form>
      </section>

      <section className={`${cardClass} p-5`}>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="ui-eyebrow">Saved drafts</span>
            <h2 className="mt-2 mb-0 text-2xl font-extrabold text-[var(--text)]">Upcoming posts</h2>
          </div>
          <span className="status-pill">{payload?.drafts.length ?? 0} drafts</span>
        </div>

        {state === "loading" ? <p className={mutedClass}>Loading drafts...</p> : null}
        {state === "loaded" && (payload?.drafts.length ?? 0) === 0 ? <p className={mutedClass}>No drafts saved yet.</p> : null}
        <div className="grid gap-4 xl:grid-cols-2">
          {(payload?.drafts ?? []).map((draft) => <DraftCard draft={draft} key={draft.id} />)}
        </div>
      </section>
    </>
  );
}
