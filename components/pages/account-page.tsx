"use client";

import { Dashboard } from "@/components/dashboard";
import { EmptyState } from "@/components/empty-state";
import { ErrorCard } from "@/components/error-card";
import { WorkspaceHeader } from "@/components/workspace-header";
import { useDashboardRuntime } from "@/components/dashboard-runtime-provider";

export function AccountPage() {
  const runtime = useDashboardRuntime();

  return (
    <>
      <WorkspaceHeader data={runtime.data} />
      {runtime.error ? <ErrorCard message={runtime.error} /> : null}
      {runtime.data ? <Dashboard data={runtime.data} /> : <EmptyState />}
    </>
  );
}
