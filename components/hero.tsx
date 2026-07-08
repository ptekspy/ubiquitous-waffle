import { cardClass, eyebrowClass, mutedClass } from "@/lib/ui/styles";

export function Hero() {
  return (
    <section className="mb-5 grid items-end gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
      <div>
        <div className={eyebrowClass}>PaidPolitely v0.3.0</div>
        <h1 className="mt-0 mb-4 max-w-3xl text-4xl font-extrabold leading-none tracking-[-0.06em] text-[var(--text)]">Reddit creator analytics.</h1>
        <p className={`${mutedClass} max-w-3xl text-lg leading-relaxed`}>
          Track subreddit fit, post formats, timing signals, and AI-assisted next-post planning from public Reddit account metadata.
        </p>
      </div>
      <div className={`${cardClass} p-4`}>
        <strong className="mb-2 block text-[var(--text)]">No Reddit secrets touched.</strong>
        <span className="block leading-snug text-[var(--text-muted)]">No password, cookies, OAuth token, session token, DMs, or account settings.</span>
      </div>
    </section>
  );
}
