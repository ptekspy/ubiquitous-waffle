import type { ExtensionState, StepState } from "@/lib/extension/types";

export const cardClass = "rounded-[28px] border border-white/12 bg-white/[0.07] shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-[18px]";

export const eyebrowClass = "text-xs font-extrabold uppercase tracking-[0.16em] text-[#ffb86b]";

export const primaryButtonClass = "min-h-11 rounded-2xl border-0 bg-linear-to-br from-[#ff4f91] to-[#ffb86b] px-5 font-black text-[#1c0b14] transition disabled:cursor-not-allowed disabled:grayscale disabled:opacity-60";

export const inputClass = "w-full min-w-0 rounded-2xl border border-white/12 bg-black/25 px-4 py-4 text-[#fff8fb] outline-none transition focus:border-[#ff4f91]";

export const mutedClass = "text-[#c9adbd]";

export function bridgeStateClass(state: ExtensionState): string {
  if (state === "installed") return "border-[#7affbc]/30 bg-[#7affbc]/[0.07]";
  if (state === "checking" || state === "scanning") return "border-[#ffb86b]/35 bg-[#ffb86b]/[0.08]";
  return "border-[#ff7878]/35 bg-[#ff7878]/[0.08]";
}

export function bridgeDotClass(state: ExtensionState): string {
  if (state === "installed") return "bg-[#7affbc] shadow-[0_0_0_7px_rgba(122,255,188,0.12)]";
  if (state === "checking" || state === "scanning") return "bg-[#ffb86b] shadow-[0_0_0_7px_rgba(255,184,107,0.12)]";
  return "bg-[#ff7878] shadow-[0_0_0_7px_rgba(255,120,120,0.12)]";
}

export function stepClass(state: StepState): string {
  if (state === "done") return "border-[#7affbc]/30 bg-[#7affbc]/[0.07]";
  if (state === "active") return "border-[#ffb86b]/35 bg-[#ffb86b]/[0.08]";
  if (state === "error") return "border-[#ff7878]/35 bg-[#ff7878]/[0.08]";
  return "border-white/12 bg-white/[0.045]";
}

export function stepBadgeClass(state: StepState): string {
  if (state === "done") return "bg-[#7affbc]/[0.18] text-[#caffdf]";
  if (state === "active") return "bg-[#ffb86b]/[0.18] text-[#ffe7c9]";
  if (state === "error") return "bg-[#ff7878]/[0.18] text-[#ffd1d1]";
  return "bg-white/[0.08] text-[#c9adbd]";
}
