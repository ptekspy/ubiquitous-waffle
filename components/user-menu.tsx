"use client";

import { authClient } from "@/lib/auth-client";

export function UserMenu() {
  const session = authClient.useSession();

  if (!session.data?.user) return null;

  async function signOut() {
    await authClient.signOut();
    await session.refetch();
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text-muted)] shadow-[var(--shadow-soft)]">
      <span>Signed in as <strong className="text-[var(--text)]">{session.data.user.email}</strong></span>
      <button className="button-secondary min-h-10 px-4" type="button" onClick={signOut}>Sign out</button>
    </div>
  );
}
