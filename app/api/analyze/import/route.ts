import { NextRequest, NextResponse } from "next/server";

import { validateImportRequest } from "@/lib/api/validation";
import { buildAccountAnalytics } from "@/lib/analytics";
import { requireCurrentUser } from "@/lib/auth/session";
import { BrowserImportError, parseBrowserImport } from "@/lib/browser-import";
import { saveAccountScan } from "@/lib/db/scans";
import { enqueuePlannerJobForScan } from "@/lib/planner/queue";

export const dynamic = "force-dynamic";

type ErrorResponse = {
  error: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ErrorResponse>({ error: "Request body must be JSON." }, { status: 400 });
  }

  const validated = validateImportRequest(body);
  if (!validated.ok) {
    return NextResponse.json<ErrorResponse>({ error: validated.error }, { status: validated.status });
  }

  try {
    const accountData = parseBrowserImport(validated.value.raw);
    const analytics = buildAccountAnalytics(accountData);
    const savedScan = await saveAccountScan(accountData, analytics, user.id, {
      enqueueDeepDiveJobs: validated.value.enqueueDeepDiveJobs,
    });
    const plannerJob = validated.value.enqueuePlannerJob ? await enqueuePlannerJobForScan(savedScan.scanId, user.id) : null;

    return NextResponse.json({
      profile: accountData.profile,
      analytics,
      warnings: accountData.warnings,
      scanId: savedScan.scanId,
      plannerJob,
    });
  } catch (error) {
    if (error instanceof BrowserImportError) {
      return NextResponse.json<ErrorResponse>({ error: error.message }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json<ErrorResponse>({ error: "Unable to analyse JSON." }, { status: 500 });
  }
}
