"use client";

import Link from "next/link";

import { ErrorCard } from "@/components/error-card";
import { LocalExtensionJobQueue } from "@/components/local-extension-job-queue";
import { useDashboardRuntime } from "@/components/dashboard-runtime-provider";
import { cardClass, mutedClass, primaryButtonClass } from "@/lib/ui/styles";
import { isValidRedditUsername } from "@/utils/is-valid-reddit-username";
import { normaliseRedditUsername } from "@/utils/normalise-reddit-username";

export function JobsPage() {
  const runtime = useDashboardRuntime();
  const username = normaliseRedditUsername(runtime.username);
  const hasUsername = isValidRedditUsername(username);

  return (
    <>
      {runtime.error ? <ErrorCard message={runtime.error} /> : null}
      {!hasUsername ? (
        <section className={`${cardClass} p-5`}>
          <span className="ui-eyebrow">Setup needed</span>
          <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Set a Reddit username first</h2>
          <p className={mutedClass}>Scheduled browser jobs need a saved Reddit username before profile scans and post deep dives can run.</p>
          <Link className={`${primaryButtonClass} mt-4 inline-flex w-fit no-underline`} href="/dashboard/settings">Open settings</Link>
        </section>
      ) : (
        <LocalExtensionJobQueue username={runtime.username} extensionState={runtime.extensionState} scanId={runtime.data?.scanId ?? null} onImported={runtime.acceptBrowserScheduledScan} onRefresh={runtime.refreshWorkspace} onStatus={() => undefined} />
      )}
    </>
  );
}
