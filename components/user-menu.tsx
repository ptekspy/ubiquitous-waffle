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
    <div className="mb-5 flex items-center justify-between gap-3 rounded-3xl border border-white/12 bg-white/[0.07] p-3 text-sm text-[#c9adbd]">
      <span>Signed in as <strong className="text-[#ffe6f0]">{session.data.user.email}</strong></span>
      <button className="rounded-2xl border border-white/12 bg-white/[0.08] px-4 py-2 font-extrabold text-[#ffe6f0]" type="button" onClick={signOut}>Sign out</button>
    </div>
  );
}
