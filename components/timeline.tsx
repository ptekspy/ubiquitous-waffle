import { useMemo } from "react";

import type { TimelinePoint } from "@/lib/types";
import { mutedClass } from "@/lib/ui/styles";
import { compactNumber } from "@/utils/compact-number";

export type TimelineProps = {
  rows: TimelinePoint[];
};

export function Timeline({ rows }: TimelineProps) {
  const maxScore = useMemo(() => Math.max(...rows.map((row) => row.score), 1), [rows]);

  if (rows.length === 0) return <p className={mutedClass}>No recent activity timeline found.</p>;

  return (
    <div className="grid gap-2.5" aria-label="Recent activity timeline">
      {rows.map((row) => (
        <div className="grid grid-cols-[56px_minmax(0,1fr)_64px] items-center gap-3" key={row.date}>
          <span className="text-sm text-[#c9adbd]">{row.date.slice(5)}</span>
          <div className="h-3 overflow-hidden rounded-full bg-white/[0.08]">
            <div className="h-full rounded-full bg-linear-to-r from-[#ff4f91] to-[#ffb86b]" style={{ width: `${Math.max(6, (row.score / maxScore) * 100)}%` }} />
          </div>
          <strong className="text-sm text-[#c9adbd]">{compactNumber(row.score)}</strong>
        </div>
      ))}
    </div>
  );
}
