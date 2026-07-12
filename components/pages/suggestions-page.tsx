"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ErrorCard } from "@/components/error-card";
import { useDashboardRuntime } from "@/components/dashboard-runtime-provider";
import type { OllamaModelOption, PostSuggestionSummary, SuggestionsResponse } from "@/lib/types";
import { cardClass, inputClass, mutedClass, primaryButtonClass } from "@/lib/ui/styles";

type LoadState = "idle" | "loading" | "loaded" | "error";

function dateTime(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function statusClass(status: PostSuggestionSummary["status"]): string {
  if (status === "COMPLETED") return "status-pill status-panel--ok";
  if (status === "RUNNING" || status === "QUEUED") return "status-pill status-panel--wait";
  return "status-pill status-panel--off";
}

function modelLabel(model: OllamaModelOption): string {
  const parts = [model.parameterSize, model.quantization, model.sizeGb === null ? null : `${model.sizeGb}GB`].filter(Boolean);
  return parts.length > 0 ? `${model.name} · ${parts.join(" · ")}` : model.name;
}

function rawSuggestionText(suggestion: PostSuggestionSummary): string | null {
  const raw = suggestion.result?.raw;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T | { error?: string };
  if (!response.ok) throw new Error(typeof payload === "object" && payload && "error" in payload && payload.error ? payload.error : "Request failed.");
  return payload as T;
}

async function fetchSuggestions(): Promise<SuggestionsResponse> {
  const response = await fetch(`/api/suggestions?ts=${Date.now()}`, { cache: "no-store" });
  return readJson<SuggestionsResponse>(response);
}

async function queueSuggestions(models: string[]): Promise<PostSuggestionSummary[]> {
  const response = await fetch("/api/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ models }),
  });
  const payload = await readJson<{ queued: PostSuggestionSummary[] }>(response);
  return payload.queued;
}

async function processNextSuggestion(): Promise<void> {
  const response = await fetch("/api/suggestions/process", { method: "POST" });
  await readJson<unknown>(response);
}

function SuggestionCard({ suggestion }: { suggestion: PostSuggestionSummary }) {
  const result = suggestion.result;
  const rawText = rawSuggestionText(suggestion);
  const whyNow = Array.isArray(result?.whyNow) ? result.whyNow.filter((item): item is string => typeof item === "string").slice(0, 4) : [];
  const risks = Array.isArray(result?.risks) ? result.risks.filter((item): item is string => typeof item === "string").slice(0, 4) : [];

  return (
    <article className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="ui-eyebrow">{suggestion.model}</span>
          <h3 className="mt-2 mb-1 text-xl font-extrabold text-[var(--text)]">{suggestion.title ?? (suggestion.status === "COMPLETED" ? "Untitled suggestion" : "Waiting for suggestion")}</h3>
          <p className="m-0 text-sm text-[var(--text-muted)]">{suggestion.subreddit ? `r/${suggestion.subreddit}` : "Target subreddit pending"} · {dateTime(suggestion.createdAt)}</p>
        </div>
        <span className={statusClass(suggestion.status)}>{suggestion.status.toLowerCase()}</span>
      </div>

      {suggestion.status === "QUEUED" || suggestion.status === "RUNNING" ? (
        <div className="grid gap-2">
          <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
            <div className="h-full w-2/5 animate-pulse rounded-full bg-[var(--accent)]" />
          </div>
          <p className={mutedClass}>{suggestion.status === "RUNNING" ? "Ollama is generating this suggestion now." : "Queued and waiting for the local processor."}</p>
        </div>
      ) : null}

      {suggestion.status === "FAILED" ? <p className="text-sm text-[var(--issue)]">{suggestion.error ?? "Generation failed."}</p> : null}

      {suggestion.status === "COMPLETED" ? (
        <div className="grid gap-3">
          {suggestion.body ? <p className="leading-relaxed text-[var(--text)]">{suggestion.body}</p> : null}
          {!suggestion.body && rawText ? <pre className="whitespace-pre-wrap rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm leading-relaxed text-[var(--text)]">{rawText}</pre> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <div><span className="block text-xs font-extrabold uppercase text-[var(--text-muted)]">Format</span><strong className="text-[var(--text)]">{suggestion.format ?? "Post"}</strong></div>
            <div><span className="block text-xs font-extrabold uppercase text-[var(--text-muted)]">Timing</span><strong className="text-[var(--text)]">{suggestion.timing ?? "Flexible"}</strong></div>
            <div><span className="block text-xs font-extrabold uppercase text-[var(--text-muted)]">Confidence</span><strong className="text-[var(--text)]">{suggestion.confidence ?? "Medium"}</strong></div>
          </div>
          {suggestion.rationale ? <p className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm leading-relaxed text-[var(--text-muted)]">{suggestion.rationale}</p> : null}
          {whyNow.length > 0 ? <ul className="grid gap-1 pl-5 text-sm text-[var(--text)]">{whyNow.map((item) => <li className="list-disc" key={item}>{item}</li>)}</ul> : null}
          {risks.length > 0 ? <p className="text-sm text-[var(--text-muted)]"><strong className="text-[var(--text)]">Watch:</strong> {risks.join(" · ")}</p> : null}
          <details>
            <summary className="cursor-pointer text-sm font-extrabold text-[var(--text-muted)]">Raw model output</summary>
            <pre className="mt-3 max-h-[280px] overflow-auto whitespace-pre-wrap rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--text)]">{rawText ?? JSON.stringify(result, null, 2)}</pre>
          </details>
        </div>
      ) : null}
    </article>
  );
}

export function SuggestionsPage() {
  const runtime = useDashboardRuntime();
  const [state, setState] = useState<LoadState>("idle");
  const [payload, setPayload] = useState<SuggestionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [checkedModels, setCheckedModels] = useState<string[]>([]);
  const [queueing, setQueueing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const processingRef = useRef(false);

  const models = payload?.models ?? [];
  const defaultModel = payload?.defaultModel ?? "";
  const pending = useMemo(() => (payload?.suggestions ?? []).some((suggestion) => suggestion.status === "QUEUED" || suggestion.status === "RUNNING"), [payload?.suggestions]);

  const load = useCallback(async () => {
    setState((current) => current === "idle" ? "loading" : current);
    setError(null);
    try {
      const data = await fetchSuggestions();
      setPayload(data);
      setState("loaded");
      setSelectedModel((current) => current || data.defaultModel || data.models[0]?.name || "");
      setCheckedModels((current) => current.length > 0 ? current : data.defaultModel ? [data.defaultModel] : data.models.slice(0, 3).map((model) => model.name));
    } catch (loadError) {
      setState("error");
      setError(loadError instanceof Error ? loadError.message : "Unable to load suggestions.");
    }
  }, []);

  const runProcessor = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    try {
      await processNextSuggestion();
      await load();
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : "Unable to process suggestion queue.");
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (pending) void runProcessor();
  }, [pending, runProcessor]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(), pending ? 3000 : 15000);
    return () => window.clearInterval(timer);
  }, [load, pending]);

  async function queueSingle() {
    if (!selectedModel) return;
    setQueueing(true);
    setError(null);
    try {
      await queueSuggestions([selectedModel]);
      await load();
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "Unable to queue suggestion.");
    } finally {
      setQueueing(false);
    }
  }

  async function queueMany() {
    if (checkedModels.length === 0) return;
    setQueueing(true);
    setError(null);
    try {
      await queueSuggestions(checkedModels);
      await load();
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "Unable to queue model comparison.");
    } finally {
      setQueueing(false);
    }
  }

  function toggleModel(model: string) {
    setCheckedModels((current) => current.includes(model) ? current.filter((item) => item !== model) : [...current, model]);
  }

  return (
    <>
      {runtime.error ? <ErrorCard message={runtime.error} /> : null}
      {error ? <ErrorCard message={error} /> : null}

      <section className={`${cardClass} mb-4 p-5`} id="suggestions">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <span className="ui-eyebrow">AI suggestions</span>
            <h2 className="mt-2 mb-1 text-2xl font-extrabold text-[var(--text)]">Next post generator</h2>
            <p className={mutedClass}>Saved account metrics, subreddit performance, historical score/views, post timings, plans, and previous suggestions are compiled into a plain-language Ollama brief.</p>
          </div>
          <button className={primaryButtonClass} type="button" onClick={() => void load()} disabled={state === "loading"}>{state === "loading" ? "Refreshing..." : "Refresh"}</button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <label className="block text-sm font-extrabold text-[var(--text)]" htmlFor="suggestion-model">Default generation model</label>
            <select id="suggestion-model" className={`${inputClass} mt-2`} value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
              {models.map((model) => <option key={model.name} value={model.name}>{modelLabel(model)}</option>)}
            </select>
            <p className="mt-2 text-sm text-[var(--text-muted)]">{models.find((model) => model.name === selectedModel)?.reason ?? "Model list is loaded dynamically from Ollama."}</p>
            <button className={`${primaryButtonClass} mt-4`} type="button" onClick={() => void queueSingle()} disabled={queueing || !selectedModel}>{queueing ? "Queueing..." : "Generate suggestion"}</button>
          </div>

          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <span className="ui-eyebrow">Model bake-off</span>
                <h3 className="mt-1 text-lg font-extrabold text-[var(--text)]">Queue one suggestion per model</h3>
              </div>
              <span className="status-pill">{checkedModels.length} selected</span>
            </div>
            <div className="grid max-h-[320px] gap-2 overflow-auto pr-1">
              {models.map((model) => (
                <label className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm" key={model.name}>
                  <input className="mt-1" type="checkbox" checked={checkedModels.includes(model.name)} onChange={() => toggleModel(model.name)} />
                  <span>
                    <span className="block font-extrabold text-[var(--text)]">{model.name}{model.recommended ? " · default" : ""}</span>
                    <span className="block text-[var(--text-muted)]">{[model.parameterSize, model.quantization, model.sizeGb === null ? null : `${model.sizeGb}GB`, model.contextLength ? `${model.contextLength} ctx` : null].filter(Boolean).join(" · ")}</span>
                  </span>
                </label>
              ))}
            </div>
            <button className={`${primaryButtonClass} mt-4 w-full`} type="button" onClick={() => void queueMany()} disabled={queueing || checkedModels.length === 0}>{queueing ? "Queueing..." : "Queue selected models"}</button>
          </div>
        </div>
      </section>

      <section className={`${cardClass} p-5`}>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="ui-eyebrow">Saved suggestions</span>
            <h2 className="mt-2 mb-0 text-2xl font-extrabold text-[var(--text)]">Suggestion library</h2>
          </div>
          {processing ? <span className="status-pill status-panel--wait">processing queue</span> : null}
        </div>

        {state === "loading" ? <p className={mutedClass}>Loading suggestions...</p> : null}
        {state === "loaded" && (payload?.suggestions.length ?? 0) === 0 ? <p className={mutedClass}>No suggestions yet. Generate one to create the first saved card.</p> : null}
        <div className="grid gap-4 xl:grid-cols-2">
          {(payload?.suggestions ?? []).map((suggestion) => <SuggestionCard key={suggestion.id} suggestion={suggestion} />)}
        </div>
      </section>
    </>
  );
}
