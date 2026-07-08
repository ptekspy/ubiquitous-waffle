import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const title = "PaidPolitely Analytics";
const description = "Reddit creator analytics, subreddit performance tracking, and AI-assisted post planning.";

export const metadata: Metadata = {
  applicationName: title,
  title: {
    default: title,
    template: `%s · ${title}`,
  },
  description,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.svg", type: "image/svg+xml" }],
    other: [{ rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#e83e8c" }],
  },
  openGraph: {
    title,
    description,
    siteName: title,
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "PaidPolitely Analytics" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/twitter-image"],
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
