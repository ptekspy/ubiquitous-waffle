import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";

import { AuthenticatedDashboard } from "@/components/authenticated-dashboard";
import { AuthGate } from "@/components/auth-gate";
import { queryKeys } from "@/lib/api/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getWorkspaceForUser } from "@/lib/db/dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
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
        <AuthenticatedDashboard />
      </AuthGate>
    </HydrationBoundary>
  );
}
