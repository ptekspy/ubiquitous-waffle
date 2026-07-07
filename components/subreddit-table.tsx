import type { SubredditMetric } from "@/lib/types";
import { mutedClass } from "@/lib/ui/styles";
import { numberFormat } from "@/utils/number-format";

export type SubredditTableProps = {
  rows: SubredditMetric[];
};

export function SubredditTable({ rows }: SubredditTableProps) {
  if (rows.length === 0) return <p className={mutedClass}>No subreddit data found yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse">
        <thead>
          <tr>
            <th className="border-b border-white/12 px-2.5 py-3 text-left text-xs font-extrabold tracking-widest text-[#c9adbd] uppercase">Subreddit</th>
            <th className="border-b border-white/12 px-2.5 py-3 text-left text-xs font-extrabold tracking-widest text-[#c9adbd] uppercase">Posts</th>
            <th className="border-b border-white/12 px-2.5 py-3 text-left text-xs font-extrabold tracking-widest text-[#c9adbd] uppercase">Comments</th>
            <th className="border-b border-white/12 px-2.5 py-3 text-left text-xs font-extrabold tracking-widest text-[#c9adbd] uppercase">Total score</th>
            <th className="border-b border-white/12 px-2.5 py-3 text-left text-xs font-extrabold tracking-widest text-[#c9adbd] uppercase">Avg post</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.subreddit}>
              <td className="border-b border-white/12 px-2.5 py-3">r/{row.subreddit}</td>
              <td className="border-b border-white/12 px-2.5 py-3">{row.posts}</td>
              <td className="border-b border-white/12 px-2.5 py-3">{row.comments}</td>
              <td className="border-b border-white/12 px-2.5 py-3">{numberFormat(row.totalScore)}</td>
              <td className="border-b border-white/12 px-2.5 py-3">{row.averagePostScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
