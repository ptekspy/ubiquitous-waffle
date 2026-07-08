import type { FormEvent } from "react";

import { EXTENSION_STORE_URL } from "@/lib/extension/constants";
import { extensionLabel } from "@/lib/extension/status";
import type { ExtensionState } from "@/lib/extension/types";
import { bridgeDotClass, bridgeStateClass, inputClass, mutedClass, primaryButtonClass } from "@/lib/ui/styles";
import { isValidRedditUsername } from "@/utils/is-valid-reddit-username";
import { normaliseRedditUsername } from "@/utils/normalise-reddit-username";

export type ScanSetupCardProps = {
  username: string;
  setUsername: (value: string) => void;
  extensionState: ExtensionState;
  extensionMessage: string;
  extensionVersion: string | null;
  hasData: boolean;
  loading: boolean;
  onCheck: () => void;
  onScan: () => void;
  onTryPublicJson: () => void;
};

export function ScanSetupCard({ username, setUsername, extensionState, extensionMessage, extensionVersion, hasData, loading, onCheck, onScan, onTryPublicJson }: ScanSetupCardProps) {
  const normalisedUsername = normaliseRedditUsername(username);
  const hasValidUsername = isValidRedditUsername(normalisedUsername);
  const extensionReady = extensionState === "installed";
  const canScan = extensionReady && hasValidUsername && !loading;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canScan) onScan();
  }

  return (
    <section className="scan-command mb-4 rounded-[22px] p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)]">
        <form onSubmit={submit}>
          <label className="mb-2 block text-sm font-black text-[var(--text-muted)]" htmlFor="username">
            Reddit username
          </label>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input className={inputClass} id="username" name="username" placeholder="u/example or account URL" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" />
            <button className={primaryButtonClass} disabled={!canScan} type="submit">
              {extensionState === "scanning" || loading ? "Refreshing..." : normalisedUsername ? `${hasData ? "Refresh" : "Scan"} u/${normalisedUsername}` : "Scan account"}
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className={mutedClass}>{hasValidUsername ? `u/${normalisedUsername} will be saved to this workspace.` : "Enter the username once; future reloads will use it automatically."}</span>
            <button className="border-0 bg-transparent p-0 text-sm font-black text-[var(--accent-strong)] underline decoration-[var(--border-strong)] underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60" type="button" onClick={onTryPublicJson} disabled={!hasValidUsername || loading}>
              Try server-side JSON
            </button>
          </div>
        </form>

        <div className={`grid items-center gap-3 rounded-[18px] p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${bridgeStateClass(extensionState)}`}>
          <span className={bridgeDotClass(extensionState)} />
          <div>
            <strong className="block text-[var(--text)]">{extensionLabel(extensionState, extensionVersion)}</strong>
            <small className="mt-1 block leading-snug text-[var(--text-muted)]">{extensionMessage}</small>
          </div>
          <button className="button-secondary min-h-10 px-3" type="button" onClick={onCheck} disabled={extensionState === "checking" || extensionState === "scanning"}>
            {extensionState === "checking" ? "Checking..." : "Recheck"}
          </button>
        </div>
      </div>

      {EXTENSION_STORE_URL ? (
        <a className="button-secondary mt-3 inline-flex w-fit items-center justify-center no-underline" href={EXTENSION_STORE_URL} target="_blank" rel="noreferrer">
          Install extension
        </a>
      ) : null}
    </section>
  );
}
