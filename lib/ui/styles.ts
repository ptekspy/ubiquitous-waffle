export const cardClass = "surface-card";
export const eyebrowClass = "ui-eyebrow";
export const primaryButtonClass = "button-primary";
export const inputClass = "input-field";
export const mutedClass = "text-muted";

export function bridgeStateClass(state?: string): string {
  if (state === "installed") return "status-panel status-panel--ok";
  if (state === "checking" || state === "scanning") return "status-panel status-panel--wait";
  return "status-panel status-panel--off";
}

export function bridgeDotClass(state?: string): string {
  if (state === "installed") return "status-dot status-dot--ok";
  if (state === "checking" || state === "scanning") return "status-dot status-dot--wait";
  return "status-dot status-dot--off";
}

export function stepClass(state?: string): string {
  if (state === "done") return "journey-step journey-step--done";
  if (state === "active") return "journey-step journey-step--active";
  if (state === "error") return "journey-step journey-step--issue";
  return "journey-step";
}

export function stepBadgeClass(state?: string): string {
  if (state === "done") return "step-badge step-badge--done";
  if (state === "active") return "step-badge step-badge--active";
  if (state === "error") return "step-badge step-badge--issue";
  return "step-badge";
}
