import { cardClass, eyebrowClass, mutedClass } from "@/lib/ui/styles";

export function EmptyState() {
  return (
    <section className={`${cardClass} mb-5 p-[26px]`}>
      <span className={eyebrowClass}>Waiting for first scan</span>
      <h2 className="my-2 text-xl font-black tracking-[-0.03em]">Run the extension scan to build the dashboard.</h2>
      <p className={`${mutedClass} max-w-3xl leading-relaxed`}>
        The extension uses the normal Reddit tab in your browser, then imports only the visible public post metadata into this
        page. No passwords, cookies, OAuth tokens, session tokens, or private messages are read.
      </p>
    </section>
  );
}
