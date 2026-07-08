import type { SubredditMetric } from "@/lib/types";
import { mutedClass } from "@/lib/ui/styles";
import { numberFormat } from "@/utils/number-format";

export type SubredditTableProps = {
  rows: SubredditMetric[];
};

const headClass = "border-b border-[var(--border)] px-2.5 py-3 text-left text-xs font-extrabold tracking-widest text-[var(--text-muted)] uppercase";
const cellClass = "border-b border-[var(--border)] px-2.5 py-3";

export function SubredditTable({ rows }: SubredditTableProps) {
  if (rows.length === 0) return <p className={mutedClass}>No subreddit data found yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-[var(--text)]">
        <thead>
          <tr>
            <th className={headClass}>Subreddit</th>
            <th className={headClass}>Posts</th>
            <th className={headClass}>Comments</th>
            <th className={headClass}>Total score</th>
            <th className={headClass}>Avg post</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.subreddit}>
              <td className={cellClass}>r/{row.subreddit}</td>
              <td className={cellClass}>{row.posts}</td>
              <td className={cellClass}>{row.comments}</td>
              <td className={cellClass}>{numberFormat(row.totalScore)}</td>
              <td className={cellClass}>{row.averagePostScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
