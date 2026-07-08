import { NextRequest, NextResponse } from "next/server";

import { buildAccountAnalytics } from "@/lib/analytics";
import { requireCurrentUser } from "@/lib/auth/session";
import { BrowserImportError, parseBrowserImport } from "@/lib/browser-import";
import { saveAccountScan } from "@/lib/db/scans";
import { enqueuePlannerJobForScan } from "@/lib/planner/queue";

export const dynamic = "force-dynamic";

type ErrorResponse = {
  error: string;
};

type ImportRequestBody = {
  raw?: unknown;
  enqueueDeepDiveJobs?: unknown;
  enqueuePlannerJob?: unknown;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  let body: ImportRequestBody;

  try {
    body = (await request.json()) as ImportRequestBody;
  } catch {
    return NextResponse.json<ErrorResponse>({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (typeof body.raw !== "string" || body.raw.trim().length === 0) {
    return NextResponse.json<ErrorResponse>({ error: "Paste JSON first." }, { status: 400 });
  }

  try {
    const accountData = parseBrowserImport(body.raw);
    const analytics = buildAccountAnalytics(accountData);
    const savedScan = await saveAccountScan(accountData, analytics, user.id, {
      enqueueDeepDiveJobs: body.enqueueDeepDiveJobs !== false,
    });
    const plannerJob = body.enqueuePlannerJob === false ? null : await enqueuePlannerJobForScan(savedScan.scanId, user.id);

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
