import { eyebrowClass } from "@/lib/ui/styles";

export type PanelHeadingProps = {
  eyebrow: string;
  title: string;
};

export function PanelHeading({ eyebrow, title }: PanelHeadingProps) {
  return (
    <div className="mb-4">
      <span className={eyebrowClass}>{eyebrow}</span>
      <h2 className="mt-2 mb-0 text-xl font-extrabold tracking-[-0.03em] text-[var(--text)]">{title}</h2>
    </div>
  );
}
