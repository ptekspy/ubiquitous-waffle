import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import type { CurrentUserResponse } from "@/lib/api/client";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<CurrentUserResponse>> {
  const user = await getCurrentUser();
  return NextResponse.json({ user });
}
