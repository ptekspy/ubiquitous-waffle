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
