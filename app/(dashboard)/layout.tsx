import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { AuthGate } from "@/components/auth-gate";
import { DashboardRuntimeProvider } from "@/components/dashboard-runtime-provider";
import { DashboardShell } from "@/components/dashboard-shell";
import { queryKeys } from "@/lib/api/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getWorkspaceForUser } from "@/lib/db/dashboard";

export const dynamic = "force-dynamic";

export default async function ProtectedDashboardLayout({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  const user = await getCurrentUser();

  queryClient.setQueryData(queryKeys.currentUser, { user });

  if (user) {
    const workspace = await getWorkspaceForUser(user.id);
    queryClient.setQueryData(queryKeys.workspace, workspace);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AuthGate>
        <DashboardRuntimeProvider>
          <DashboardShell>{children}</DashboardShell>
        </DashboardRuntimeProvider>
      </AuthGate>
    </HydrationBoundary>
  );
}
