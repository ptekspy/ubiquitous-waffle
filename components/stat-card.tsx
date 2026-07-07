import { cardClass } from "@/lib/ui/styles";

export type StatCardProps = {
  label: string;
  value: string;
  detail?: string;
};

export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <article className={`${cardClass} p-[18px]`}>
      <span className="block text-sm text-[#c9adbd]">{label}</span>
      <strong className="my-2 block text-[clamp(1.35rem,3vw,2rem)] font-black tracking-[-0.04em]">{value}</strong>
      {detail ? <small className="text-[#c9adbd]">{detail}</small> : null}
    </article>
  );
}
