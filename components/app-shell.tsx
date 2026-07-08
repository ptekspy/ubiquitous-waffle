import type { ReactNode } from "react";

import { ThemeToggle } from "./theme-toggle";

type NavigationGroup = {
  label: string;
  items: Array<{ label: string; href: string; badge?: string }>;
};

const navigationGroups: NavigationGroup[] = [
  {
    label: "Core",
    items: [
      { label: "Overview", href: "#overview" },
      { label: "Capture", href: "#capture" },
      { label: "Product Ops", href: "#product-ops", badge: "new" },
      { label: "Local Queue", href: "#local-queue" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "Changes", href: "#intelligence" },
      { label: "Trends", href: "#trends" },
      { label: "Post Insights", href: "#post-insights", badge: "new" },
      { label: "Subreddits", href: "#subreddits" },
      { label: "Posts", href: "#posts" },
      { label: "Comments", href: "#comments" },
    ],
  },
  {
    label: "Planning",
    items: [
      { label: "Planner", href: "#planner" },
      { label: "Dares", href: "#dares" },
      { label: "Advanced Tools", href: "#advanced-tools" },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <main className="app-shell">
      <aside className="app-sidebar" aria-label="PaidPolitely navigation">
        <a className="brand-lockup" href="#top" aria-label="PaidPolitely Analytics home">
          <span className="brand-mark">P</span>
          <span>
            <strong>PaidPolitely</strong>
            <small>Creator OS</small>
          </span>
        </a>

        <nav className="app-nav" aria-label="Dashboard sections">
          {navigationGroups.map((group) => (
            <section className="app-nav__group" key={group.label}>
              <p className="app-nav__label">{group.label}</p>
              <div className="app-nav__items">
                {group.items.map((item, index) => (
                  <a className={index === 0 && group.label === "Core" ? "app-nav__item app-nav__item--active" : "app-nav__item"} href={item.href} key={item.href}>
                    <span>{item.label}</span>
                    {item.badge ? <small className="app-nav__badge">{item.badge}</small> : null}
                  </a>
                ))}
              </div>
            </section>
          ))}
        </nav>
      </aside>

      <section className="app-main" id="top">
        <header className="app-topbar">
          <div>
            <p className="ui-eyebrow">Creator intelligence</p>
            <h1>Reddit Analytics</h1>
          </div>
          <ThemeToggle />
        </header>
        {children}
      </section>
    </main>
  );
}
