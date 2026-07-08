"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { AccountMetricTrendCard } from "@/components/account-metric-trend-card";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { EmptyState } from "@/components/empty-state";
import { ErrorCard } from "@/components/error-card";
import { HistoricalAnalyticsPanel } from "@/components/historical-analytics-panel";
import { LocalExtensionJobQueue } from "@/components/local-extension-job-queue";
import { ManualImportCard } from "@/components/manual-import-card";
import { ProductOpsPanel } from "@/components/product-ops-panel";
import { ScanSetupCard } from "@/components/scan-setup-card";
import { UserMenu } from "@/components/user-menu";
import { WorkspaceHeader } from "@/components/workspace-header";
import { fetchPublicAnalysis, importBrowserPayload, saveWorkspaceRedditUsername } from "@/lib/api/client";
import type { WorkspaceResponse } from "@/lib/api/client";
import { queryKeys, workspaceQueryOptions } from "@/lib/api/queries";
import { sendExtensionMessage } from "@/lib/extension/client";
import type { ExtensionPingResponse, ExtensionScanResponse, ExtensionState, LoadState } from "@/lib/extension/types";
import type { AnalyzeResponse } from "@/lib/types";
import { isValidRedditUsername } from "@/utils/is-valid-reddit-username";
import { normaliseRedditUsername } from "@/utils/normalise-reddit-username";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function AuthenticatedDashboard() {
  const queryClient = useQueryClient();
  const workspaceQuery = useQuery(workspaceQueryOptions());
  const initialWorkspace = workspaceQuery.data;

  const [username, setUsername] = useState(() => initialWorkspace?.settings.redditUsername ?? "");
  const [importPayload, setImportPayload] = useState("");
  const [state, setState] = useState<LoadState>(() => (initialWorkspace?.latest ? "loaded" : "idle"));
  const [workspaceState, setWorkspaceState] = useState<LoadState>(() => (initialWorkspace ? "loaded" : "loading"));
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(() => initialWorkspace?.latest ?? null);
  const [extensionState, setExtensionState] = useState<ExtensionState>("checking");
  const [extensionMessage, setExtensionMessage] = useState("Checking whether PaidPolitely Capture is installed on this page.");
  const [extensionVersion, setExtensionVersion] = useState<string | null>(null);

  const applyWorkspace = useCallback((workspace: WorkspaceResponse) => {
    const savedUsername = workspace.settings.redditUsername;
    if (savedUsername) setUsername(savedUsername);

    if (workspace.latest) {
      setData(workspace.latest);
      setState("loaded");
    } else {
      setData(null);
      setState("idle");
    }

    setWorkspaceState("loaded");
  }, []);

  const writeScanToWorkspaceCache = useCallback(
    (scan: AnalyzeResponse) => {
      queryClient.setQueryData<WorkspaceResponse>(queryKeys.workspace, {
        settings: { redditUsername: scan.profile.username },
        latest: scan,
      });
    },
    [queryClient],
  );

  const loadWorkspace = useCallback(async () => {
    setWorkspaceState("loading");
    setError(null);

    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspace });
      const workspace = await queryClient.fetchQuery(workspaceQueryOptions());
      applyWorkspace(workspace);
      return workspace;
    } catch (workspaceError) {
      setWorkspaceState("error");
      setError(errorMessage(workspaceError));
      return null;
    }
  }, [applyWorkspace, queryClient]);

  const checkExtension = useCallback(async () => {
    setExtensionState("checking");
    setExtensionMessage("Checking for PaidPolitely Capture. Reload this page after reloading the unpacked extension.");

    try {
      const response = await sendExtensionMessage<ExtensionPingResponse>({ type: "PAIDPOLITELY_PING" });
      if (response.ok) {
        setExtensionState("installed");
        setExtensionVersion(response.version ?? null);
        setExtensionMessage(`Ready${response.bridge ? ` via ${response.bridge}` : ""}.`);
        return;
      }

      setExtensionState("error");
      setExtensionVersion(null);
      setExtensionMessage(response.error ?? "PaidPolitely Capture responded, but not with a valid ping response.");
    } catch (extensionError) {
      setExtensionState("missing");
      setExtensionVersion(null);
      setExtensionMessage(extensionError instanceof Error ? extensionError.message : "PaidPolitely Capture was not detected.");
    }
  }, []);

  useEffect(() => {
    if (workspaceQuery.isPending) {
      setWorkspaceState("loading");
      return;
    }

    if (workspaceQuery.isError) {
      setWorkspaceState("error");
      setError(errorMessage(workspaceQuery.error));
      return;
    }

    if (workspaceQuery.data) applyWorkspace(workspaceQuery.data);
  }, [applyWorkspace, workspaceQuery.data, workspaceQuery.error, workspaceQuery.isError, workspaceQuery.isPending]);

  useEffect(() => {
    void checkExtension();
  }, [checkExtension]);

  useEffect(() => {
    const handler = () => void loadWorkspace();
    window.addEventListener("paidpolitely-workspace-refresh", handler);
    return () => window.removeEventListener("paidpolitely-workspace-refresh", handler);
  }, [loadWorkspace]);

  const rememberUsername = useCallback(async (normalisedUsername: string) => {
    const result = await saveWorkspaceRedditUsername(normalisedUsername);
    if (result.ok) {
      setUsername(result.data.settings.redditUsername ?? normalisedUsername);
      return;
    }

    setError(result.error);
  }, []);

  const importRawPayload = useCallback(
    async (raw: string): Promise<boolean> => {
      setState("loading");
      setError(null);

      const result = await importBrowserPayload(raw);
      if (!result.ok) {
        setState("error");
        setError(result.error);
        return false;
      }

      setData(result.data);
      setUsername(result.data.profile.username);
      setState("loaded");
      writeScanToWorkspaceCache(result.data);
      return true;
    },
    [writeScanToWorkspaceCache],
  );

  const analysePublicJson = useCallback(async () => {
    const normalisedUsername = normaliseRedditUsername(username);
    if (!isValidRedditUsername(normalisedUsername)) {
      setState("error");
      setError("Enter a valid Reddit username before trying public JSON.");
      return;
    }

    setState("loading");
    setError(null);
    await rememberUsername(normalisedUsername);

    const result = await fetchPublicAnalysis(normalisedUsername);
    if (!result.ok) {
      setState("error");
      setError(result.error);
      return;
    }

    setData(result.data);
    setUsername(result.data.profile.username);
    setState("loaded");
    writeScanToWorkspaceCache(result.data);
  }, [rememberUsername, username, writeScanToWorkspaceCache]);

  const analyseImport = useCallback(async () => {
    await importRawPayload(importPayload);
  }, [importPayload, importRawPayload]);

  const scanWithExtension = useCallback(async () => {
    const normalisedUsername = normaliseRedditUsername(username);
    if (!isValidRedditUsername(normalisedUsername)) {
      setState("error");
      setError("Enter a valid Reddit username before scanning with the extension.");
      return;
    }

    setState("loading");
    setError(null);
    await rememberUsername(normalisedUsername);
    setExtensionState("scanning");
    setExtensionMessage(`Trying a paginated no-tab Reddit scan for u/${normalisedUsername}. If Reddit blocks JSON, PaidPolitely will fall back to a quiet tab.`);

    try {
      const response = await sendExtensionMessage<ExtensionScanResponse>({
        type: "PAIDPOLITELY_SCAN_REDDIT_PROFILE",
        username: normalisedUsername,
        preferHeadless: true,
        openInBackground: true,
      });

      if (!response.ok) {
        setState("error");
        setExtensionState("installed");
        setExtensionMessage(response.error);
        setError(response.error);
        return;
      }

      const raw = JSON.stringify(response.payload, null, 2);
      setImportPayload(raw);
      const imported = await importRawPayload(raw);
      setExtensionState("installed");
      window.dispatchEvent(new Event("paidpolitely-account-metrics-refresh"));
      setExtensionMessage(imported ? `Captured and imported u/${normalisedUsername}${response.status === "captured_headless" ? " without opening Reddit" : " with quiet tab fallback"}. Profile and deep-dive automation can now continue from the local queue.` : "The extension captured data, but the app could not import it.");
    } catch (extensionError) {
      setState("error");
      setExtensionState("missing");
      const message = extensionError instanceof Error ? extensionError.message : "PaidPolitely Capture was not detected.";
      setExtensionMessage(message);
      setError(message);
    }
  }, [importRawPayload, rememberUsername, username]);

  const acceptBrowserScheduledScan = useCallback(
    (scan: AnalyzeResponse) => {
      setData(scan);
      setUsername(scan.profile.username);
      setState("loaded");
      writeScanToWorkspaceCache(scan);
      window.dispatchEvent(new Event("paidpolitely-account-metrics-refresh"));
    },
    [writeScanToWorkspaceCache],
  );

  const loading = state === "loading" || workspaceState === "loading";

  return (
    <AppShell>
      <UserMenu />
      <WorkspaceHeader data={data} />

      {state === "error" && error ? <ErrorCard message={error} /> : null}
      {workspaceState === "error" && error ? <ErrorCard message={error} /> : null}

      <ScanSetupCard
        username={username}
        setUsername={setUsername}
        extensionState={extensionState}
        extensionMessage={extensionMessage}
        extensionVersion={extensionVersion}
        hasData={Boolean(data)}
        loading={loading}
        onCheck={checkExtension}
        onScan={scanWithExtension}
        onTryPublicJson={analysePublicJson}
      />

      <ProductOpsPanel extensionState={extensionState} extensionVersion={extensionVersion} username={username} />

      <LocalExtensionJobQueue username={username} extensionState={extensionState} scanId={data?.scanId ?? null} onImported={acceptBrowserScheduledScan} onRefresh={loadWorkspace} onStatus={setExtensionMessage} />

      <HistoricalAnalyticsPanel username={username} hasLiveScan={Boolean(data)} onRunFirstScan={scanWithExtension} />

      <section id="trends" className="analytics-section">
        <AccountMetricTrendCard />
      </section>

      {data ? <Dashboard data={data} /> : <EmptyState />}

      <details className="advanced-tools mt-4 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]" id="advanced-tools">
        <summary>Advanced tools</summary>
        <div className="mt-4">
          <ManualImportCard importPayload={importPayload} setImportPayload={setImportPayload} onImport={analyseImport} loading={loading} />
        </div>
      </details>
    </AppShell>
  );
}
