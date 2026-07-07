import type { StepState } from "@/lib/extension/types";
import { stepBadgeClass, stepClass } from "@/lib/ui/styles";

export type JourneyStepProps = {
  number: number;
  title: string;
  body: string;
  state: StepState;
};

export function JourneyStep({ number, title, body, state }: JourneyStepProps) {
  return (
    <li className={`grid grid-cols-[42px_minmax(0,1fr)] items-center gap-3 rounded-[20px] border p-3 ${stepClass(state)}`}>
      <span className={`grid size-9 place-items-center rounded-full font-black ${stepBadgeClass(state)}`}>{state === "done" ? "✓" : number}</span>
      <div>
        <strong className="block">{title}</strong>
        <small className="mt-1 block leading-snug text-[#c9adbd]">{body}</small>
      </div>
    </li>
  );
}
