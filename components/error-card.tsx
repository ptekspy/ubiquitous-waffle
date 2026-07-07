import { cardClass } from "@/lib/ui/styles";

export type ErrorCardProps = {
  message: string;
};

export function ErrorCard({ message }: ErrorCardProps) {
  return <div className={`${cardClass} mb-[18px] border-[#ff7878]/50 p-[26px] text-[#ff7878]`}>{message}</div>;
}
