import { NextRequest, NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { getProductOps, handleProductOpsAction, type ProductOpsResponse } from "@/lib/product/ops";

export const dynamic = "force-dynamic";

type ErrorResponse = { error: string };

export async function GET(): Promise<NextResponse<ProductOpsResponse | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  const ops = await getProductOps(user.id);
  return NextResponse.json(ops);
}

export async function POST(request: NextRequest): Promise<NextResponse<ProductOpsResponse | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  try {
    const action = await request.json();
    const ops = await handleProductOpsAction(user.id, action);
    return NextResponse.json(ops);
  } catch (error) {
    return NextResponse.json<ErrorResponse>({ error: error instanceof Error ? error.message : "Unable to update product operations." }, { status: 400 });
  }
}
