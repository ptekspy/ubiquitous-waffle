import { cardClass, eyebrowClass, mutedClass } from "@/lib/ui/styles";

export function EmptyState() {
  return (
    <section className={`${cardClass} mb-5 p-5`}>
      <span className={eyebrowClass}>No saved scan yet</span>
      <h2 className="my-2 text-2xl font-extrabold tracking-[-0.03em] text-[var(--text)]">Run your first scan to create the dashboard.</h2>
      <p className={`${mutedClass} max-w-3xl leading-relaxed`}>
        After the first scan, PaidPolitely saves the cleaned analytics to PostgreSQL and reloads the latest dashboard automatically whenever you sign in again.
      </p>
    </section>
  );
}
