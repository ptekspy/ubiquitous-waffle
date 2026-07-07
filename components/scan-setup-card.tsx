import type { FormEvent } from "react";

import { EXTENSION_STORE_URL } from "@/lib/extension/constants";
import { extensionLabel, extensionStepState } from "@/lib/extension/status";
import type { ExtensionState, StepState } from "@/lib/extension/types";
import { bridgeDotClass, bridgeStateClass, cardClass, eyebrowClass, inputClass, mutedClass, primaryButtonClass } from "@/lib/ui/styles";
import { isValidRedditUsername } from "@/utils/is-valid-reddit-username";
import { normaliseRedditUsername } from "@/utils/normalise-reddit-username";
import { JourneyStep } from "./journey-step";

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

function usernameStepState(hasValidUsername: boolean, extensionReady: boolean): StepState {
  if (hasValidUsername) return "done";
  if (extensionReady) return "active";
  return "todo";
}

function captureStepState(extensionState: ExtensionState, loading: boolean, hasData: boolean, canScan: boolean): StepState {
  if (extensionState === "scanning" || loading) return "active";
  if (hasData) return "done";
  if (canScan) return "active";
  return "todo";
}

export function ScanSetupCard({
  username,
  setUsername,
  extensionState,
  extensionMessage,
  extensionVersion,
  hasData,
  loading,
  onCheck,
  onScan,
  onTryPublicJson,
}: ScanSetupCardProps) {
  const normalisedUsername = normaliseRedditUsername(username);
  const hasValidUsername = isValidRedditUsername(username);
  const extensionReady = extensionState === "installed";
  const canScan = extensionReady && hasValidUsername && !loading;
  const reviewStepState: StepState = hasData ? "done" : "todo";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canScan) onScan();
  }

  return (
    <section className={`${cardClass} mb-[18px] grid gap-[22px] p-[22px] lg:grid-cols-[minmax(0,1fr)_minmax(300px,390px)]`}>
      <div>
        <span className={eyebrowClass}>Recommended flow</span>
        <h2 className="my-2.5 text-[clamp(1.8rem,4vw,3rem)] leading-none font-black tracking-[-0.05em]">Scan a Reddit profile with the browser extension.</h2>
        <p className={`${mutedClass} mb-[18px] max-w-3xl leading-relaxed`}>
          PaidPolitely opens or focuses the Reddit profile, checks it is visible, captures the public post rows, removes Reddit
          promo/game cards, and builds the report here.
        </p>
        <div className={`grid items-center gap-3 rounded-[22px] border p-3.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${bridgeStateClass(extensionState)}`}>
          <span className={`size-3.5 rounded-full ${bridgeDotClass(extensionState)}`} />
          <div>
            <strong className="block">{extensionLabel(extensionState, extensionVersion)}</strong>
            <small className="mt-1 block leading-snug text-[#c9adbd]">{extensionMessage}</small>
          </div>
          <button className={`${primaryButtonClass} min-h-10 px-3.5`} type="button" onClick={onCheck} disabled={extensionState === "checking" || extensionState === "scanning"}>
            {extensionState === "checking" ? "Checking..." : "Recheck"}
          </button>
        </div>
      </div>

      <ol className="grid content-start gap-2.5 p-0">
        <JourneyStep number={1} title="Extension" body="Detect PaidPolitely Capture in this browser." state={extensionStepState(extensionState)} />
        <JourneyStep number={2} title="Username" body="Paste a username, profile URL, or u/name." state={usernameStepState(hasValidUsername, extensionReady)} />
        <JourneyStep number={3} title="Capture" body="Open Reddit, scroll the profile, and import metadata." state={captureStepState(extensionState, loading, hasData, canScan)} />
        <JourneyStep number={4} title="Review" body="Read the subreddit, timing, and content signals." state={reviewStepState} />
      </ol>

      <form className="rounded-3xl border border-white/12 bg-black/15 p-4 lg:col-span-2" onSubmit={submit}>
        <label className="mb-2 block text-sm font-extrabold text-[#c9adbd]" htmlFor="username">Reddit profile</label>
        <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            className={inputClass}
            id="username"
            name="username"
            placeholder="u/MrMrsHK or reddit.com/user/MrMrsHK"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
          />
          <button className={primaryButtonClass} disabled={!canScan} type="submit">
            {extensionState === "scanning" || loading ? "Scanning..." : normalisedUsername ? `Scan u/${normalisedUsername}` : "Scan profile"}
          </button>
        </div>
        <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <small className="text-[#c9adbd]">{extensionReady ? "Extension ready. Reddit will open in a tab if needed." : "Install or reload the extension, then recheck."}</small>
          <button className="border-0 bg-transparent p-0 font-extrabold text-[#ffe6f0] underline decoration-white/25 underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60" type="button" onClick={onTryPublicJson} disabled={!hasValidUsername || loading}>
            Try server-side JSON instead
          </button>
        </div>
        {EXTENSION_STORE_URL ? (
          <a className={`${primaryButtonClass} mt-3 inline-flex w-fit items-center justify-center no-underline`} href={EXTENSION_STORE_URL} target="_blank" rel="noreferrer">
            Install extension
          </a>
        ) : null}
      </form>
    </section>
  );
}
