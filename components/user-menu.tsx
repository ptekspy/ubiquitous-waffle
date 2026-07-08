"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { currentUserQueryOptions, queryKeys } from "@/lib/api/queries";
import { authClient } from "@/lib/auth-client";

export function UserMenu() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const currentUserQuery = useQuery(currentUserQueryOptions());
  const user = currentUserQuery.data ? currentUserQuery.data.user : (session.data?.user ?? null);

  if (!user) return null;

  async function signOut() {
    await authClient.signOut();
    queryClient.setQueryData(queryKeys.currentUser, { user: null });
    queryClient.removeQueries({ queryKey: queryKeys.workspace });
    await session.refetch();
    router.refresh();
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text-muted)] shadow-[var(--shadow-soft)]">
      <span>Signed in as <strong className="text-[var(--text)]">{user.email}</strong></span>
      <button className="button-secondary min-h-10 px-4" type="button" onClick={signOut}>Sign out</button>
    </div>
  );
}
