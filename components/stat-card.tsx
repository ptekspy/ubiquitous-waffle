import { cardClass } from "@/lib/ui/styles";

export type StatCardProps = {
  label: string;
  value: string;
  detail?: string;
};

export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <article className={`${cardClass} p-4`}>
      <span className="block text-sm font-bold text-[var(--text-muted)]">{label}</span>
      <strong className="my-2 block text-3xl font-extrabold tracking-[-0.04em] text-[var(--text)]">{value}</strong>
      {detail ? <small className="text-[var(--text-muted)]">{detail}</small> : null}
    </article>
  );
}
