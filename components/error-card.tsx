import { cardClass } from "@/lib/ui/styles";

export type ErrorCardProps = {
  message: string;
};

export function ErrorCard({ message }: ErrorCardProps) {
  return <div className={`${cardClass} mb-4 border-[var(--issue)] bg-[var(--issue-soft)] p-4 text-[var(--issue)]`}>{message}</div>;
}
