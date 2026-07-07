import { cardClass, eyebrowClass } from "@/lib/ui/styles";

export function Hero() {
  return (
    <section className="mb-[22px] grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
      <div>
        <div className={eyebrowClass}>PaidPolitely v0.2.5</div>
        <h1 className="mt-0 mb-[18px] max-w-3xl text-[clamp(2.4rem,6vw,5rem)] leading-[0.94] font-black tracking-[-0.07em]">Reddit profile scan in one browser click.</h1>
        <p className="max-w-3xl text-lg leading-relaxed text-[#c9adbd]">
          Extension-first analytics for creator accounts. Try no-tab Reddit JSON first, fall back to quiet browser capture only
          when needed, and turn public metadata into subreddit and content signals.
        </p>
      </div>
      <div className={`${cardClass} bg-linear-to-br from-[#7affbc]/[0.11] to-white/[0.055] p-[18px]`}>
        <strong className="mb-2 block text-[#d9ffe9]">No Reddit secrets touched.</strong>
        <span className="block leading-snug text-[#c9adbd]">No password, cookies, OAuth token, session token, DMs, or account settings.</span>
      </div>
    </section>
  );
}
