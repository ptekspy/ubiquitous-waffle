"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ErrorCard } from "@/components/error-card";
import { currentUserQueryOptions } from "@/lib/api/queries";
import { useDashboardRuntime } from "@/components/dashboard-runtime-provider";
import type { ExtensionState } from "@/lib/extension/types";
import type { ProductOpsResponse } from "@/lib/product/ops";
import { cardClass, inputClass, mutedClass, primaryButtonClass } from "@/lib/ui/styles";
import { compactNumber } from "@/utils/compact-number";
import { isValidRedditUsername } from "@/utils/is-valid-reddit-username";
import { normaliseRedditUsername } from "@/utils/normalise-reddit-username";

const buttonClass = "rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm font-extrabold text-[var(--accent-strong)] no-underline disabled:cursor-not-allowed disabled:opacity-50";

type OpsState = "idle" | "loading" | "loaded" | "error";

type CardAction =
  | { label: string; href: string; kind?: "primary" | "secondary" }
  | { label: string; onClick: () => void | Promise<void>; disabled?: boolean; kind?: "primary" | "secondary" };

function statusClass(status: "ok" | "warn" | "off" | string): string {
  if (status === "ok") return "status-pill status-panel--ok";
  if (status === "warn") return "status-pill status-panel--wait";
  if (status === "off") return "status-pill status-panel--off";
  return "status-pill";
}

function extensionHealth(extensionState: ExtensionState): "ok" | "warn" | "off" {
  if (extensionState === "installed") return "ok";
  if (extensionState === "checking" || extensionState === "scanning") return "warn";
  return "off";
}

function dateTime(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function DashboardCard({ eyebrow, title, description, status, children, actions }: { eyebrow: string; title: string; description?: string; status?: { label: string; tone: "ok" | "warn" | "off" | string }; children?: React.ReactNode; actions?: CardAction[] }) {
  return (
    <section className={`${cardClass} p-5`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <span className="ui-eyebrow">{eyebrow}</span>
          <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">{title}</h2>
          {description ? <p className={mutedClass}>{description}</p> : null}
        </div>
        {status ? <span className={statusClass(status.tone)}>{status.label}</span> : null}
      </div>
      {children ? <div className="grid gap-3">{children}</div> : null}
      {actions && actions.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((action) => {
            const className = action.kind === "primary" ? primaryButtonClass : buttonClass;
            if ("href" in action) {
              return <Link className={className} href={action.href} key={`${action.label}-${action.href}`}>{action.label}</Link>;
            }
            return <button className={className} type="button" onClick={action.onClick} disabled={action.disabled} key={action.label}>{action.label}</button>;
          })}
        </div>
      ) : null}
    </section>
  );
}

async function fetchOps(): Promise<ProductOpsResponse> {
  const response = await fetch(`/api/product/ops?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load product operations.");
  return (await response.json()) as ProductOpsResponse;
}

function useProductOpsSummary() {
  const [state, setState] = useState<OpsState>("idle");
  const [ops, setOps] = useState<ProductOpsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    void load();
  }, []);

  return { state, ops, error, load };
}

function WorkspaceCard() {
  const runtime = useDashboardRuntime();
  const userQuery = useQuery(currentUserQueryOptions());
  const user = userQuery.data?.user ?? null;
  const latest = runtime.data;
  const username = normaliseRedditUsername(runtime.username);

  return (
    <DashboardCard
      eyebrow="Workspace"
      title={username ? `u/${username}` : "Workspace ready"}
      description="Your signed-in workspace, latest scan, and extension state."
      status={{ label: runtime.workspaceState, tone: runtime.workspaceState === "loaded" ? "ok" : runtime.workspaceState === "error" ? "off" : "warn" }}
      actions={[
        { label: "Refresh workspace", onClick: runtime.refreshWorkspace, disabled: runtime.loading },
        { label: "Open account", href: "/dashboard/account" },
      ]}
    >
      <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
        <span className="block text-sm text-[var(--text-muted)]">Signed in</span>
        <strong className="text-[var(--text)]">{user?.email ?? "Loading…"}</strong>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <span className="block text-sm text-[var(--text-muted)]">Latest scan</span>
          <strong className="text-[var(--text)]">{latest?.scanId ? "Available" : "No scan yet"}</strong>
        </div>
        <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <span className="block text-sm text-[var(--text-muted)]">Total karma</span>
          <strong className="text-[var(--text)]">{latest ? compactNumber(latest.profile.totalKarma) : "—"}</strong>
        </div>
      </div>
    </DashboardCard>
  );
}

function RedditUsernameCard() {
  const runtime = useDashboardRuntime();
  const [draft, setDraft] = useState(runtime.username);
  const normalised = normaliseRedditUsername(draft);
  const valid = isValidRedditUsername(normalised);

  return (
    <DashboardCard eyebrow="Setup" title="Reddit username" description="Set this once here. After it is saved, edit it from Settings." status={{ label: valid ? "ready" : "needed", tone: valid ? "warn" : "off" }}>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) void runtime.rememberUsername(normalised);
        }}
      >
        <input className={inputClass} placeholder="u/example or account URL" value={draft} onChange={(event) => setDraft(event.target.value)} autoComplete="off" />
        <div className="flex flex-wrap gap-2">
          <button className={primaryButtonClass} type="submit" disabled={!valid || runtime.loading}>Save username</button>
          <button className={buttonClass} type="button" disabled={!valid || runtime.loading || runtime.extensionState !== "installed"} onClick={() => void runtime.scanWithExtension()}>Save and scan</button>
        </div>
      </form>
    </DashboardCard>
  );
}

function ScheduledJobsCard() {
  const runtime = useDashboardRuntime();
  const username = normaliseRedditUsername(runtime.username);
  const ready = runtime.extensionState === "installed" && isValidRedditUsername(username);

  return (
    <DashboardCard
      eyebrow="Automation"
      title="Scheduled browser jobs"
      description="The browser extension handles local profile scans and post deep dives using this session."
      status={{ label: ready ? "ready" : "needs setup", tone: ready ? "ok" : "warn" }}
      actions={[
        username ? { label: runtime.extensionState === "installed" ? "Run scan" : "Check extension", onClick: runtime.extensionState === "installed" ? runtime.scanWithExtension : runtime.checkExtension, disabled: runtime.loading || runtime.extensionState === "scanning", kind: "primary" } : { label: "Set username", href: "/dashboard/settings", kind: "primary" },
        { label: "Open jobs", href: "/dashboard/jobs" },
      ]}
    >
      <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
        <span className="block text-sm text-[var(--text-muted)]">Extension</span>
        <strong className="text-[var(--text)]">{runtime.extensionVersion ? `Installed v${runtime.extensionVersion}` : runtime.extensionState}</strong>
        <small className="mt-1 block text-[var(--text-muted)]">{runtime.extensionMessage}</small>
      </div>
      <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
        <span className="block text-sm text-[var(--text-muted)]">Deep dives</span>
        <strong className="text-[var(--text)]">{runtime.data?.scanId ? "Ready after saved scan" : "Waiting for first scan"}</strong>
      </div>
    </DashboardCard>
  );
}

function AccountTrendDashboardCard() {
  const runtime = useDashboardRuntime();
  const data = runtime.data;

  return (
    <DashboardCard
      eyebrow="Account trend"
      title="Karma and followers"
      description="Track live account metrics from extension scans and imported historical snapshots."
      status={{ label: data ? "live" : "empty", tone: data ? "ok" : "warn" }}
      actions={[
        { label: "View trends", href: "/dashboard/trends", kind: "primary" },
        data ? { label: "Open account", href: "/dashboard/account" } : { label: "Run first scan", onClick: runtime.scanWithExtension, disabled: runtime.loading || runtime.extensionState !== "installed" },
      ]}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <span className="block text-sm text-[var(--text-muted)]">Total karma</span>
          <strong className="text-[var(--text)]">{data ? compactNumber(data.profile.totalKarma) : "—"}</strong>
        </div>
        <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <span className="block text-sm text-[var(--text-muted)]">Followers</span>
          <strong className="text-[var(--text)]">{data?.profile.followerCount === null || data?.profile.followerCount === undefined ? "N/A" : compactNumber(data.profile.followerCount)}</strong>
        </div>
        <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <span className="block text-sm text-[var(--text-muted)]">Planner</span>
          <strong className="text-[var(--text)]">{data?.plannerJob?.status ?? "—"}</strong>
        </div>
      </div>
    </DashboardCard>
  );
}

function onboardingAction(key: string, runtime: ReturnType<typeof useDashboardRuntime>): CardAction | null {
  const username = normaliseRedditUsername(runtime.username);
  const canScan = isValidRedditUsername(username) && runtime.extensionState === "installed";

  if (key === "account") return { label: "Set username", href: "/dashboard/settings" };
  if (key === "scan") return canScan ? { label: "Run scan", onClick: runtime.scanWithExtension, disabled: runtime.loading, kind: "primary" } : { label: "Open settings", href: "/dashboard/settings" };
  if (key === "metrics") return { label: "Open jobs", href: "/dashboard/jobs" };
  if (key === "followers") return runtime.extensionState === "installed" ? { label: "Run profile scan", onClick: runtime.scanWithExtension, disabled: runtime.loading } : { label: "Check extension", onClick: runtime.checkExtension };
  return { label: "Open product ops", href: "/dashboard/product-ops" };
}

function healthAction(key: string, runtime: ReturnType<typeof useDashboardRuntime>): CardAction | null {
  if (key === "extension") return { label: "Check extension", onClick: runtime.checkExtension };
  if (key === "scan" || key === "followers") return runtime.extensionState === "installed" ? { label: "Run scan", onClick: runtime.scanWithExtension, disabled: runtime.loading, kind: "primary" } : { label: "Open settings", href: "/dashboard/settings" };
  if (key === "deepDive") return { label: "Open jobs", href: "/dashboard/jobs" };
  if (key === "planner") return { label: "Open product ops", href: "/dashboard/product-ops" };
  if (key === "database") return { label: "Refresh", onClick: runtime.refreshWorkspace };
  return null;
}

function ProductOpsSummaryCards() {
  const runtime = useDashboardRuntime();
  const { state, ops, error, load } = useProductOpsSummary();
  const extension = { key: "extension", label: "Extension", status: extensionHealth(runtime.extensionState), detail: runtime.extensionState === "installed" ? `Installed${runtime.extensionVersion ? `, version ${runtime.extensionVersion}` : ""}.` : "Reload or install PaidPolitely Capture." };
  const healthRows = ops ? [...ops.health, extension] : [extension];
  const incomplete = ops?.onboarding.filter((item) => !item.complete) ?? [];

  return (
    <>
      <DashboardCard
        eyebrow="Product ops"
        title="Onboarding checklist"
        description={state === "loading" ? "Loading checklist…" : incomplete.length === 0 && ops ? "Everything important is complete." : "Finish the next setup items to make the workspace useful."}
        status={{ label: ops ? `${ops.onboarding.length - incomplete.length}/${ops.onboarding.length}` : state, tone: incomplete.length === 0 && ops ? "ok" : "warn" }}
        actions={[{ label: "Refresh", onClick: load }, { label: "Open product ops", href: "/dashboard/product-ops" }]}
      >
        {error ? <p className="text-[var(--issue)]">{error}</p> : null}
        {(ops?.onboarding ?? []).slice(0, 5).map((item) => {
          const action = item.complete ? null : onboardingAction(item.key, runtime);
          return (
            <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-muted)] p-3" key={item.key}>
              <div className="mb-2 flex items-start justify-between gap-3">
                <strong className="text-[var(--text)]">{item.label}</strong>
                <span className={item.complete ? "status-pill status-panel--ok" : "status-pill status-panel--wait"}>{item.complete ? "done" : "todo"}</span>
              </div>
              <small className="block text-[var(--text-muted)]">{item.detail}</small>
              {action ? <div className="mt-3"><DashboardInlineAction action={action} /></div> : null}
            </div>
          );
        })}
      </DashboardCard>

      <DashboardCard
        eyebrow="Workspace health"
        title="Things needing attention"
        description="Health checks include database, scans, followers, deep dives, planner jobs and extension status."
        status={{ label: healthRows.every((item) => item.status === "ok") ? "healthy" : "action needed", tone: healthRows.every((item) => item.status === "ok") ? "ok" : "warn" }}
        actions={[{ label: "Refresh", onClick: load }, { label: "Open settings", href: "/dashboard/settings" }]}
      >
        {healthRows.map((item) => {
          const action = item.status === "ok" ? null : healthAction(item.key, runtime);
          return (
            <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-muted)] p-3" key={item.key}>
              <div className="mb-2 flex items-start justify-between gap-3">
                <strong className="text-[var(--text)]">{item.label}</strong>
                <span className={statusClass(item.status)}>{item.status}</span>
              </div>
              <small className="block text-[var(--text-muted)]">{item.detail}</small>
              {action ? <div className="mt-3"><DashboardInlineAction action={action} /></div> : null}
            </div>
          );
        })}
        {ops?.generatedAt ? <small className="text-[var(--text-muted)]">Last checked {dateTime(ops.generatedAt)}</small> : null}
      </DashboardCard>
    </>
  );
}

function DashboardInlineAction({ action }: { action: CardAction }) {
  if ("href" in action) return <Link className={buttonClass} href={action.href}>{action.label}</Link>;
  return <button className={buttonClass} type="button" onClick={action.onClick} disabled={action.disabled}>{action.label}</button>;
}

export function DashboardHomePage() {
  const runtime = useDashboardRuntime();
  const savedUsername = isValidRedditUsername(normaliseRedditUsername(runtime.username));

  return (
    <>
      {runtime.error ? <ErrorCard message={runtime.error} /> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <WorkspaceCard />
        {!savedUsername ? <RedditUsernameCard /> : null}
        <ScheduledJobsCard />
        <AccountTrendDashboardCard />
        <ProductOpsSummaryCards />
      </div>
    </>
  );
}
