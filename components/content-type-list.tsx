import type { ContentTypeMetric } from "@/lib/types";
import { mutedClass } from "@/lib/ui/styles";

export type ContentTypeListProps = {
  rows: ContentTypeMetric[];
};

export function ContentTypeList({ rows }: ContentTypeListProps) {
  if (rows.length === 0) return <p className={mutedClass}>No public post formats found yet.</p>;

  return (
    <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
      {rows.map((row) => (
        <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-muted)] p-3.5" key={row.type}>
          <strong className="mb-2 block text-lg capitalize text-[var(--text)]">{row.type}</strong>
          <span className="block text-sm text-[var(--text-muted)]">{row.posts} posts</span>
          <small className="block text-sm text-[var(--text-muted)]">{row.averageScore} avg score</small>
        </div>
      ))}
    </div>
  );
}
