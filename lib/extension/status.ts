import type { ExtensionState, StepState } from "./types";

export function extensionLabel(state: ExtensionState, version: string | null): string {
  if (state === "installed") return `Extension ready${version ? ` · v${version}` : ""}`;
  if (state === "scanning") return "Scanning Reddit";
  if (state === "checking") return "Checking extension";
  if (state === "missing") return "Extension not detected";
  if (state === "not-configured") return "Extension not configured";
  return "Extension error";
}

export function extensionStepState(state: ExtensionState): StepState {
  if (state === "installed") return "done";
  if (state === "missing" || state === "error") return "error";
  return "active";
}

export function usernameStepState(hasValidUsername: boolean, extensionReady: boolean): StepState {
  if (hasValidUsername) return "done";
  if (extensionReady) return "active";
  return "todo";
}

export function captureStepState(extensionState: ExtensionState, loading: boolean, hasData: boolean, canScan: boolean): StepState {
  if (extensionState === "scanning" || loading) return "active";
  if (hasData) return "done";
  if (canScan) return "active";
  return "todo";
}
