import { NextRequest, NextResponse } from "next/server";

import { validateProductOpsAction } from "@/lib/api/validation";
import { requireCurrentUser } from "@/lib/auth/session";
import { getProductOps, handleProductOpsAction, type ProductOpsResponse } from "@/lib/product/ops";
import { ensureProductOpsTables } from "@/lib/product/schema";

export const dynamic = "force-dynamic";

type ErrorResponse = { error: string };

export async function GET(): Promise<NextResponse<ProductOpsResponse | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  try {
    await ensureProductOpsTables();
    const ops = await getProductOps(user.id);
    return NextResponse.json(ops);
  } catch (error) {
    return NextResponse.json<ErrorResponse>({ error: error instanceof Error ? error.message : "Unable to load product operations." }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<ProductOpsResponse | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ErrorResponse>({ error: "Request body must be JSON." }, { status: 400 });
  }

  const validated = validateProductOpsAction(body);
  if (!validated.ok) {
    return NextResponse.json<ErrorResponse>({ error: validated.error }, { status: validated.status });
  }

  try {
    await ensureProductOpsTables();
    const ops = await handleProductOpsAction(user.id, validated.value);
    return NextResponse.json(ops);
  } catch (error) {
    return NextResponse.json<ErrorResponse>({ error: error instanceof Error ? error.message : "Unable to update product operations." }, { status: 400 });
  }
}
