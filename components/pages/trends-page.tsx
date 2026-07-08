"use client";

import { AccountMetricTrendCard } from "@/components/account-metric-trend-card";
import { ErrorCard } from "@/components/error-card";
import { HistoricalAnalyticsPanel } from "@/components/historical-analytics-panel";
import { useDashboardRuntime } from "@/components/dashboard-runtime-provider";

export function TrendsPage() {
  const runtime = useDashboardRuntime();

  return (
    <>
      {runtime.error ? <ErrorCard message={runtime.error} /> : null}
      <section id="trends" className="analytics-section">
        <AccountMetricTrendCard />
      </section>
      <HistoricalAnalyticsPanel username={runtime.username} hasLiveScan={Boolean(runtime.data)} onRunFirstScan={runtime.scanWithExtension} />
    </>
  );
}
