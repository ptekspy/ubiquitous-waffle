"use client";

import { ErrorCard } from "@/components/error-card";
import { ProductOpsPanel } from "@/components/product-ops-panel";
import { useDashboardRuntime } from "@/components/dashboard-runtime-provider";

export function ProductOpsPage() {
  const runtime = useDashboardRuntime();

  return (
    <>
      {runtime.error ? <ErrorCard message={runtime.error} /> : null}
      <ProductOpsPanel extensionState={runtime.extensionState} extensionVersion={runtime.extensionVersion} username={runtime.username} />
    </>
  );
}
