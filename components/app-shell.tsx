import type { ReactNode } from "react";

import { ThemeToggle } from "./theme-toggle";

const navigationItems = ["Overview", "Subreddits", "Posts", "Comments", "Planner", "Settings"];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <main className="app-shell">
      <aside className="app-sidebar" aria-label="PaidPolitely navigation">
        <a className="brand-lockup" href="#top" aria-label="PaidPolitely Analytics home">
          <span className="brand-mark">P</span>
          <span>
            <strong>PaidPolitely</strong>
            <small>Analytics</small>
          </span>
        </a>

        <nav className="app-nav" aria-label="Dashboard sections">
          {navigationItems.map((item) => (
            <a className={item === "Overview" ? "app-nav__item app-nav__item--active" : "app-nav__item"} href={`#${item.toLowerCase()}`} key={item}>
              {item}
            </a>
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
