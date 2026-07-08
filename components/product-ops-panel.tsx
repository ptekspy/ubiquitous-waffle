"use client";

import { useEffect, useState } from "react";

import type { ProductOpsResponse } from "@/lib/product/ops";
import type { ExtensionState } from "@/lib/extension/types";
import { cardClass, mutedClass } from "@/lib/ui/styles";
import { compactNumber } from "@/utils/compact-number";

type LoadState = "idle" | "loading" | "loaded" | "error";

type ProductOpsPanelProps = {
  extensionState: ExtensionState;
  extensionVersion: string | null;
  username: string;
};

async function fetchOps(): Promise<ProductOpsResponse> {
  const response = await fetch(`/api/product/ops?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load product operations.");
  return (await response.json()) as ProductOpsResponse;
}

async function sendAction(action: unknown): Promise<ProductOpsResponse> {
  const response = await fetch("/api/product/ops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error || "Unable to update product operations.");
  return payload as ProductOpsResponse;
}

function statusClass(status: "ok" | "warn" | "off" | string): string {
  if (status === "ok") return "status-pill status-panel--ok";
  if (status === "warn") return "status-pill status-panel--wait";
  if (status === "off") return "status-pill status-panel--off";
  return "status-pill";
}

function dateTime(value: string | null): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function cadence(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes >= 120) return `${Math.round(minutes / 60)}h`;
  return `${minutes}m`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm font-bold text-[var(--text)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

const inputClass = "rounded-[12px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]";
const buttonClass = "rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm font-extrabold text-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50";

export function ProductOpsPanel({ extensionState, extensionVersion, username }: ProductOpsPanelProps) {
  const [state, setState] = useState<LoadState>("idle");
  const [ops, setOps] = useState<ProductOpsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [plannedTitle, setPlannedTitle] = useState("");
  const [plannedSubreddit, setPlannedSubreddit] = useState("daresgonewild");
  const [plannedFor, setPlannedFor] = useState("");
  const [trackedSubreddit, setTrackedSubreddit] = useState("daresgonewild");
  const [peerUsername, setPeerUsername] = useState("");

  async function load() {
    setState("loading");
    setError(null);
    try {
      const result = await fetchOps();
      setOps(result);
      setState("loaded");
    } catch (loadError) {
      setState("error");
      setError(loadError instanceof Error ? loadError.message : "Unable to load product operations.");
    }
  }

  async function act(action: unknown) {
    setBusy(true);
    setError(null);
    try {
      const result = await sendAction(action);
      setOps(result);
      setState("loaded");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update product operations.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const extensionHealth = extensionState === "installed" ? "ok" : extensionState === "checking" || extensionState === "scanning" ? "warn" : "off";

  return (
    <section className={`${cardClass} mb-4 overflow-hidden p-5`} id="product-ops">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <span className="ui-eyebrow">Product ops</span>
          <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Reddit growth operating system</h2>
          <p className={mutedClass}>Onboarding, health, settings, scan history, planned actions, reports, tracked subreddits, and peer tracking.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={statusClass(extensionHealth)}>Extension {extensionVersion ? `v${extensionVersion}` : extensionState}</span>
          <button className={buttonClass} type="button" onClick={() => void load()} disabled={busy}>Refresh</button>
        </div>
      </div>

      {state === "loading" ? <p className={mutedClass}>Loading product ops…</p> : null}
      {error ? <p className="mb-4 text-[var(--issue)]">{error}</p> : null}

      {ops ? (
        <div className="grid gap-4">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <h3 className="mb-3 text-xl font-extrabold text-[var(--text)]">Onboarding checklist</h3>
              <div className="grid gap-2">
                {ops.onboarding.map((item) => (
                  <div className="flex items-start justify-between gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-3" key={item.key}>
                    <div>
                      <strong className="text-[var(--text)]">{item.label}</strong>
                      <small className="mt-1 block text-[var(--text-muted)]">{item.detail}</small>
                    </div>
                    <span className={item.complete ? "status-pill status-panel--ok" : "status-pill status-panel--wait"}>{item.complete ? "done" : "todo"}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <h3 className="mb-3 text-xl font-extrabold text-[var(--text)]">Workspace health</h3>
              <div className="grid gap-2 md:grid-cols-2">
                {[...ops.health, { key: "extension", label: "Extension", status: extensionHealth, detail: extensionState === "installed" ? `Installed${extensionVersion ? `, version ${extensionVersion}` : ""}.` : "Reload or install PaidPolitely Capture." }].map((item) => (
                  <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-3" key={item.key}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <strong className="text-[var(--text)]">{item.label}</strong>
                      <span className={statusClass(item.status)}>{item.status}</span>
                    </div>
                    <small className="text-[var(--text-muted)]">{item.detail}</small>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <h3 className="mb-3 text-xl font-extrabold text-[var(--text)]">Accounts</h3>
              <p className="mb-3 text-sm text-[var(--text-muted)]">Current input: {username ? `u/${username}` : "none"}</p>
              <div className="grid gap-2">
                {ops.accounts.map((account) => (
                  <button
                    className={ops.settings.activeAccountId === account.id || (!ops.settings.activeAccountId && ops.activeAccount?.id === account.id) ? "rounded-[14px] border border-[var(--accent)] bg-[var(--surface)] p-3 text-left" : "rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-3 text-left"}
                    key={account.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void act({ action: "settings:update", values: { activeAccountId: account.id } })}
                  >
                    <strong className="block text-[var(--text)]">u/{account.username}</strong>
                    <small className="text-[var(--text-muted)]">{compactNumber(account.totalKarma)} karma · {account.followerCount === null ? "N/A" : compactNumber(account.followerCount)} followers</small>
                  </button>
                ))}
                {ops.accounts.length === 0 ? <p className={mutedClass}>No accounts yet. Run your first scan.</p> : null}
              </div>
            </article>

            <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <h3 className="mb-3 text-xl font-extrabold text-[var(--text)]">Settings</h3>
              <form
                className="grid gap-3 md:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void act({ action: "settings:update", values: { timezone: form.get("timezone"), profileScanInterval: Number(form.get("profileScanInterval")), deepDiveInterval: Number(form.get("deepDiveInterval")), deepDiveBatchSize: Number(form.get("deepDiveBatchSize")), plannerModel: form.get("plannerModel"), trackedSubredditText: form.get("trackedSubredditText"), plannerEnabled: form.get("plannerEnabled") === "on", weeklyReportEnabled: form.get("weeklyReportEnabled") === "on" } });
                }}
              >
                <Field label="Timezone"><input className={inputClass} name="timezone" defaultValue={ops.settings.timezone} /></Field>
                <Field label="Planner model"><input className={inputClass} name="plannerModel" defaultValue={ops.settings.plannerModel ?? ""} placeholder="qwen2.5:7b-instruct" /></Field>
                <Field label="Profile scan ms"><input className={inputClass} name="profileScanInterval" type="number" defaultValue={ops.settings.profileScanInterval} /></Field>
                <Field label="Deep-dive ms"><input className={inputClass} name="deepDiveInterval" type="number" defaultValue={ops.settings.deepDiveInterval} /></Field>
                <Field label="Deep-dive batch"><input className={inputClass} name="deepDiveBatchSize" type="number" defaultValue={ops.settings.deepDiveBatchSize} /></Field>
                <Field label="Tracked subreddit text"><input className={inputClass} name="trackedSubredditText" defaultValue={ops.settings.trackedSubredditText} /></Field>
                <label className="flex items-center gap-2 text-sm font-bold text-[var(--text)]"><input name="plannerEnabled" type="checkbox" defaultChecked={ops.settings.plannerEnabled} /> Planner enabled</label>
                <label className="flex items-center gap-2 text-sm font-bold text-[var(--text)]"><input name="weeklyReportEnabled" type="checkbox" defaultChecked={ops.settings.weeklyReportEnabled} /> Weekly report enabled</label>
                <button className={buttonClass} type="submit" disabled={busy}>Save settings</button>
              </form>
              <p className="mt-3 text-sm text-[var(--text-muted)]">Current cadences: profile {cadence(ops.settings.profileScanInterval)}, deep dive {cadence(ops.settings.deepDiveInterval)}.</p>
            </article>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <h3 className="mb-3 text-xl font-extrabold text-[var(--text)]">What changed?</h3>
              <div className="grid gap-2">
                {ops.changes.map((change, index) => (
                  <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-3" key={`${change.title}-${index}`}>
                    <div className="mb-1 flex items-start justify-between gap-3"><strong className="text-[var(--text)]">{change.title}</strong><span className={statusClass(change.severity === "good" ? "ok" : change.severity === "watch" ? "warn" : "neutral")}>{change.severity}</span></div>
                    <small className="block text-[var(--text-muted)]">{change.detail}</small>
                    <small className="mt-1 block font-bold text-[var(--text-muted)]">{dateTime(change.timestamp)}</small>
                  </div>
                ))}
                {ops.changes.length === 0 ? <p className={mutedClass}>No changes yet. Let a few scans accumulate.</p> : null}
              </div>
            </article>

            <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <div className="mb-3 flex items-start justify-between gap-3"><h3 className="text-xl font-extrabold text-[var(--text)]">Weekly report</h3><button className={buttonClass} disabled={busy} type="button" onClick={() => void act({ action: "report:generate" })}>Save report</button></div>
              <strong className="block text-[var(--text)]">{ops.weeklyReport.title}</strong>
              <ul className="mt-3 grid gap-2 pl-5 text-sm text-[var(--text)]">
                {ops.weeklyReport.bullets.map((bullet) => <li className="list-disc" key={bullet}>{bullet}</li>)}
              </ul>
            </article>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <h3 className="mb-3 text-xl font-extrabold text-[var(--text)]">Action tracker / planned posts</h3>
              <form className="mb-4 grid gap-2 md:grid-cols-[1fr_180px_180px_auto]" onSubmit={(event) => { event.preventDefault(); void act({ action: "planned:create", title: plannedTitle, subreddit: plannedSubreddit, plannedFor: plannedFor || null, format: "post", rationale: "Created from Product Ops panel." }); setPlannedTitle(""); }}>
                <input className={inputClass} value={plannedTitle} onChange={(event) => setPlannedTitle(event.target.value)} placeholder="Post title / action" required />
                <input className={inputClass} value={plannedSubreddit} onChange={(event) => setPlannedSubreddit(event.target.value)} placeholder="subreddit" required />
                <input className={inputClass} value={plannedFor} onChange={(event) => setPlannedFor(event.target.value)} type="datetime-local" />
                <button className={buttonClass} disabled={busy} type="submit">Plan</button>
              </form>
              <div className="grid gap-2">
                {ops.plannedPosts.map((post) => (
                  <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-3" key={post.id}>
                    <div className="mb-2 flex items-start justify-between gap-3"><strong className="text-[var(--text)]">{post.title}</strong><span className="status-pill">{post.status.toLowerCase()}</span></div>
                    <small className="block text-[var(--text-muted)]">r/{post.subreddit} · {dateTime(post.plannedFor)} · expected {post.expectedScore ?? "?"} score</small>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {post.status !== "POSTED" ? <button className={buttonClass} disabled={busy} type="button" onClick={() => void act({ action: "planned:update", id: post.id, status: "POSTED" })}>Mark posted</button> : null}
                      {post.status !== "SKIPPED" ? <button className={buttonClass} disabled={busy} type="button" onClick={() => void act({ action: "planned:update", id: post.id, status: "SKIPPED" })}>Skip</button> : null}
                    </div>
                  </div>
                ))}
                {ops.plannedPosts.length === 0 ? <p className={mutedClass}>No planned posts yet.</p> : null}
              </div>
            </article>

            <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <h3 className="mb-3 text-xl font-extrabold text-[var(--text)]">Scan history</h3>
              <div className="grid max-h-[460px] gap-2 overflow-y-auto pr-1">
                {ops.scans.map((scan) => (
                  <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-3" key={scan.id}>
                    <strong className="text-[var(--text)]">{dateTime(scan.fetchedAt)}</strong>
                    <small className="mt-1 block text-[var(--text-muted)]">{scan.posts} posts · {scan.comments} comments · {compactNumber(scan.totalPostScore)} score · {scan.bestSubreddit ? `best r/${scan.bestSubreddit}` : "no best subreddit"}</small>
                  </div>
                ))}
                {ops.scans.length === 0 ? <p className={mutedClass}>No scan history yet.</p> : null}
              </div>
            </article>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <h3 className="mb-3 text-xl font-extrabold text-[var(--text)]">Tracked subreddits</h3>
              <form className="mb-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); void act({ action: "subreddit:add", subreddit: trackedSubreddit }); }}>
                <input className={inputClass} value={trackedSubreddit} onChange={(event) => setTrackedSubreddit(event.target.value)} placeholder="daresgonewild" />
                <button className={buttonClass} disabled={busy} type="submit">Add</button>
              </form>
              <div className="grid gap-2">
                {ops.trackedSubreddits.map((row) => (
                  <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-3" key={row.id}>
                    <div className="mb-1 flex items-start justify-between gap-3"><strong className="text-[var(--text)]">r/{row.subreddit}</strong><span className={row.enabled ? "status-pill status-panel--ok" : "status-pill status-panel--off"}>{row.enabled ? "on" : "off"}</span></div>
                    <small className="text-[var(--text-muted)]">{row.posts} posts seen · avg {row.averageScore} · best hour {row.bestHourUtc === null ? "?" : `${row.bestHourUtc}:00 UTC`}</small>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <h3 className="mb-3 text-xl font-extrabold text-[var(--text)]">Peer accounts</h3>
              <form className="mb-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); void act({ action: "peer:add", username: peerUsername }); setPeerUsername(""); }}>
                <input className={inputClass} value={peerUsername} onChange={(event) => setPeerUsername(event.target.value)} placeholder="username" />
                <button className={buttonClass} disabled={busy} type="submit">Add</button>
              </form>
              <div className="grid gap-2">
                {ops.trackedPeers.map((peer) => (
                  <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-3" key={peer.id}>
                    <div className="mb-1 flex items-start justify-between gap-3"><strong className="text-[var(--text)]">u/{peer.username}</strong><span className={peer.enabled ? "status-pill status-panel--ok" : "status-pill status-panel--off"}>{peer.enabled ? "tracked" : "off"}</span></div>
                    <small className="text-[var(--text-muted)]">Score {peer.latestScore ?? "manual"} · followers {peer.latestFollowers ?? "manual"}</small>
                  </div>
                ))}
                {ops.trackedPeers.length === 0 ? <p className={mutedClass}>No peer accounts yet.</p> : null}
              </div>
            </article>
          </section>
        </div>
      ) : null}
    </section>
  );
}
