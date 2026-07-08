export type WarningCardProps = {
  warnings: string[];
};

export function WarningCard({ warnings }: WarningCardProps) {
  if (warnings.length === 0) return null;

  return (
    <section className="rounded-[18px] border border-[var(--wait)] bg-[var(--wait-soft)] p-4">
      <strong className="mb-2 block text-[var(--wait)]">Import notes</strong>
      <ul className="grid gap-1.5 pl-5 text-[var(--text)]">
        {warnings.map((warning) => (
          <li className="list-disc" key={warning}>{warning}</li>
        ))}
      </ul>
    </section>
  );
}
