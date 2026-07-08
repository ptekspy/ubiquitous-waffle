import { useState } from "react";

import { BROWSER_CAPTURE_SNIPPET } from "@/lib/browser-capture-snippet";
import { cardClass, inputClass, mutedClass, primaryButtonClass } from "@/lib/ui/styles";

export type ManualImportCardProps = {
  importPayload: string;
  setImportPayload: (value: string) => void;
  onImport: () => void;
  loading: boolean;
};

export function ManualImportCard({ importPayload, setImportPayload, onImport, loading }: ManualImportCardProps) {
  const [copied, setCopied] = useState(false);

  async function copySnippet() {
    await navigator.clipboard.writeText(BROWSER_CAPTURE_SNIPPET);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <details className={`${cardClass} mb-4 overflow-hidden`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3.5 p-5 marker:hidden after:grid after:size-[34px] after:place-items-center after:rounded-full after:bg-[var(--surface-muted)] after:text-xl after:font-extrabold after:text-[var(--text-muted)] after:content-['+'] open:after:content-['−']">
        <span>
          <span className="block font-extrabold text-[var(--text)]">Manual import / debugging fallback</span>
          <small className="block text-[var(--text-muted)]">Use this only if the extension bridge fails.</small>
        </span>
      </summary>
      <div className="grid gap-3.5 border-t border-[var(--border)] p-5">
        <p className={`${mutedClass} leading-relaxed`}>
          Open the Reddit profile, paste the robust capture snippet into DevTools, let it scroll, then paste the copied JSON here.
          The importer will still clean duplicates, game cards, and comment-link rows.
        </p>
        <div className="flex flex-wrap gap-3">
          <button className={primaryButtonClass} type="button" onClick={copySnippet}>
            {copied ? "Snippet copied" : "Copy robust capture snippet"}
          </button>
        </div>
        <textarea
          className={`${inputClass} min-h-[152px] resize-y font-mono text-sm leading-relaxed`}
          value={importPayload}
          onChange={(event) => setImportPayload(event.target.value)}
          placeholder='Paste { "source": "paidpolitely-reddit-extension-capture-v2", ... } or browser-import JSON here'
        />
        <button className={`${primaryButtonClass} justify-self-start`} type="button" onClick={onImport} disabled={loading || importPayload.trim().length === 0}>
          {loading ? "Importing..." : "Analyse pasted JSON"}
        </button>
      </div>
    </details>
  );
}
