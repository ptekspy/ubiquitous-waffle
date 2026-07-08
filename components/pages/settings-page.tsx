"use client";

import { ErrorCard } from "@/components/error-card";
import { ScanSetupCard } from "@/components/scan-setup-card";
import { useDashboardRuntime } from "@/components/dashboard-runtime-provider";
import { cardClass, mutedClass } from "@/lib/ui/styles";
import { normaliseRedditUsername } from "@/utils/normalise-reddit-username";

export function SettingsPage() {
  const runtime = useDashboardRuntime();
  const username = normaliseRedditUsername(runtime.username);

  return (
    <>
      {runtime.error ? <ErrorCard message={runtime.error} /> : null}
      <section className={`${cardClass} mb-4 p-5`}>
        <span className="ui-eyebrow">Workspace settings</span>
        <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Reddit account</h2>
        <p className={mutedClass}>{username ? `Current workspace account is u/${username}. Change it below if you need to switch accounts.` : "Save the Reddit username this workspace should track."}</p>
      </section>
      <ScanSetupCard
        username={runtime.username}
        setUsername={runtime.setUsername}
        extensionState={runtime.extensionState}
        extensionMessage={runtime.extensionMessage}
        extensionVersion={runtime.extensionVersion}
        hasData={Boolean(runtime.data)}
        loading={runtime.loading}
        onCheck={runtime.checkExtension}
        onScan={runtime.scanWithExtension}
        onTryPublicJson={runtime.analysePublicJson}
      />
    </>
  );
}
