"use client";

import { ErrorCard } from "@/components/error-card";
import { ManualImportCard } from "@/components/manual-import-card";
import { useDashboardRuntime } from "@/components/dashboard-runtime-provider";
import { cardClass, mutedClass } from "@/lib/ui/styles";

export function AdvancedPage() {
  const runtime = useDashboardRuntime();

  return (
    <>
      {runtime.error ? <ErrorCard message={runtime.error} /> : null}
      <section className={`${cardClass} mb-4 p-5`}>
        <span className="ui-eyebrow">Advanced tools</span>
        <h2 className="mt-2 mb-1 text-2xl font-extrabold tracking-[-0.04em] text-[var(--text)]">Manual import and debug</h2>
        <p className={mutedClass}>Use this when the extension capture needs debugging or when you want to paste a raw browser payload.</p>
      </section>
      <ManualImportCard importPayload={runtime.importPayload} setImportPayload={runtime.setImportPayload} onImport={runtime.analyseImport} loading={runtime.loading} />
    </>
  );
}
