export type WarningCardProps = {
  warnings: string[];
};

export function WarningCard({ warnings }: WarningCardProps) {
  if (warnings.length === 0) return null;

  return (
    <section className="rounded-3xl border border-[#ffb86b]/40 bg-[#ffb86b]/10 p-[18px]">
      <strong className="mb-2 block text-[#ffb86b]">Import notes</strong>
      <ul className="grid gap-1.5 pl-5 text-[#ffe7c9]">
        {warnings.map((warning) => (
          <li className="list-disc" key={warning}>{warning}</li>
        ))}
      </ul>
    </section>
  );
}
