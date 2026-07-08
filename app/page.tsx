"use client";

import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { Dashboard } from "@/components/dashboard";
import { EmptyState } from "@/components/empty-state";
import { ErrorCard } from "@/components/error-card";
import { LocalExtensionJobQueue } from "@/components/local-extension-job-queue";
import { ManualImportCard } from "@/components/manual-import-card";
import { ProductOpsPanel } from "@/components/product-ops-panel";
import { ScanSetupCard } from "@/components/scan-setup-card";
import { UserMenu } from "@/components/user-menu";
import { WorkspaceHeader } from "@/components/workspace-header";
import { fetchPublicAnalysis, fetchWorkspace, importBrowserPayload, saveWorkspaceRedditUsername } from "@/lib/api/client";
import { sendExtensionMessage } from "@/lib/extension/client";
import type { ExtensionPingResponse, ExtensionScanResponse, ExtensionState, LoadState } from "@/lib/extension/types";
import type { AnalyzeResponse } from "@/lib/types";
import { isValidRedditUsername } from "@/utils/is-valid-reddit-username";
import { normaliseRedditUsername } from "@/utils/normalise-reddit-username";

export default function Home() {
  return (
    <AuthGate>
      <AuthenticatedDashboard />
    </AuthGate>
  );
}

function AuthenticatedDashboard() {
  const [username, setUsername] = useState("");
  const [importPayload, setImportPayload] = useState("");
  const [state, setState] = useState<LoadState>("idle");
  const [workspaceState, setWorkspaceState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [extensionState, setExtensionState] = useState<ExtensionState>("checking");
  const [extensionMessage, setExtensionMessage] = useState("Checking whether PaidPolitely Capture is installed on this page.");
  const [extensionVersion, setExtensionVersion] = useState<string | null>(null);

  useEffect(() => {
    void checkExtension();
    void loadWorkspace();
  }, []);

  useEffect(() => {
    const handler = () => void loadWorkspace();
    window.addEventListener("paidpolitely-workspace-refresh", handler);
    return () => window.removeEventListener("paidpolitely-workspace-refresh", handler);
  }, []);

  async function loadWorkspace() {
    setWorkspaceState("loading");

    const result = await fetchWorkspace();
    if (!result.ok) {
      setWorkspaceState("error");
      setError(result.error);
      return;
    }

    const savedUsername = result.data.settings.redditUsername;
    if (savedUsername) setUsername(savedUsername);

    if (result.data.latest) {
      setData(result.data.latest);
      setState("loaded");
    } else {
      setState("idle");
    }

    setWorkspaceState("loaded");
  }

  async function rememberUsername(normalisedUsername: string) {
    const result = await saveWorkspaceRedditUsername(normalisedUsername);
    if (result.ok) {
      setUsername(result.data.settings.redditUsername ?? normalisedUsername);
      return;
    }

    setError(result.error);
  }

  async function checkExtension() {
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
  }

  async function importRawPayload(raw: string): Promise<boolean> {
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
    return true;
  }

  async function analysePublicJson() {
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
  }

  async function analyseImport() {
    await importRawPayload(importPayload);
  }

  async function scanWithExtension() {
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
      setExtensionMessage(imported ? `Captured and imported u/${normalisedUsername}${response.status === "captured_headless" ? " without opening Reddit" : " with quiet tab fallback"}.` : "The extension captured data, but the app could not import it.");
    } catch (extensionError) {
      setState("error");
      setExtensionState("missing");
      const message = extensionError instanceof Error ? extensionError.message : "PaidPolitely Capture was not detected.";
      setExtensionMessage(message);
      setError(message);
    }
  }

  function acceptBrowserScheduledScan(scan: AnalyzeResponse) {
    setData(scan);
    setUsername(scan.profile.username);
    setState("loaded");
  }

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

      {data ? <Dashboard data={data} /> : <EmptyState />}

      <details className="advanced-tools mt-4 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
        <summary>Advanced tools</summary>
        <div className="mt-4">
          <ManualImportCard importPayload={importPayload} setImportPayload={setImportPayload} onImport={analyseImport} loading={loading} />
        </div>
      </details>
    </AppShell>
  );
}
