"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

type NavigationGroup = {
  label: string;
  items: Array<{ label: string; href: string; badge?: string }>;
};

const navigationGroups: NavigationGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Account", href: "/dashboard/account" },
      { label: "Jobs", href: "/dashboard/jobs" },
      { label: "Crawler", href: "/dashboard/crawler", badge: "new" },
      { label: "Users", href: "/dashboard/users" },
      { label: "Subreddits", href: "/dashboard/subreddits" },
      { label: "Settings", href: "/dashboard/settings" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "Trends", href: "/dashboard/trends" },
      { label: "Product Ops", href: "/dashboard/product-ops", badge: "new" },
    ],
  },
  {
    label: "Tools",
    items: [{ label: "Advanced", href: "/dashboard/advanced" }],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function pageTitle(pathname: string): { eyebrow: string; title: string } {
  if (pathname.startsWith("/dashboard/account")) return { eyebrow: "Account intelligence", title: "Account Analytics" };
  if (pathname.startsWith("/dashboard/jobs")) return { eyebrow: "Browser automation", title: "Scheduled Jobs" };
  if (pathname.startsWith("/dashboard/crawler")) return { eyebrow: "Always-on crawling", title: "Crawler Data" };
  if (pathname.startsWith("/dashboard/users")) return { eyebrow: "Discovered creators", title: "Users" };
  if (pathname.startsWith("/dashboard/subreddits")) return { eyebrow: "Community coverage", title: "Subreddits" };
  if (pathname.startsWith("/dashboard/trends")) return { eyebrow: "Growth signals", title: "Trends" };
  if (pathname.startsWith("/dashboard/product-ops")) return { eyebrow: "Operating system", title: "Product Ops" };
  if (pathname.startsWith("/dashboard/settings")) return { eyebrow: "Workspace setup", title: "Settings" };
  if (pathname.startsWith("/dashboard/advanced")) return { eyebrow: "Debug tools", title: "Advanced" };
  return { eyebrow: "Creator intelligence", title: "Dashboard" };
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const title = pageTitle(pathname);

  return (
    <main className="app-shell">
      <aside className="app-sidebar" aria-label="PaidPolitely navigation">
        <Link className="brand-lockup" href="/dashboard" aria-label="PaidPolitely Analytics home">
          <span className="brand-mark">P</span>
          <span>
            <strong>PaidPolitely</strong>
            <small>Creator OS</small>
          </span>
        </Link>

        <nav className="app-nav" aria-label="Dashboard pages">
          {navigationGroups.map((group) => (
            <section className="app-nav__group" key={group.label}>
              <p className="app-nav__label">{group.label}</p>
              <div className="app-nav__items">
                {group.items.map((item) => (
                  <Link className={isActive(pathname, item.href) ? "app-nav__item app-nav__item--active" : "app-nav__item"} href={item.href} key={item.href}>
                    <span>{item.label}</span>
                    {item.badge ? <small className="app-nav__badge">{item.badge}</small> : null}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </nav>
      </aside>

      <section className="app-main" id="top">
        <header className="app-topbar">
          <div>
            <p className="ui-eyebrow">{title.eyebrow}</p>
            <h1>{title.title}</h1>
          </div>
          <ThemeToggle />
        </header>
        <UserMenu />
        {children}
      </section>
    </main>
  );
}
