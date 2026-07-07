import { NextRequest, NextResponse } from "next/server";

import { buildAccountAnalytics } from "@/lib/analytics";
import { BrowserImportError, parseBrowserImport } from "@/lib/browser-import";
import { saveAccountScan } from "@/lib/db/scans";
import { enqueuePlannerJobForScan } from "@/lib/planner/queue";

export const dynamic = "force-dynamic";

type ErrorResponse = {
  error: string;
};

type ImportRequestBody = {
  raw?: unknown;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: ImportRequestBody;

  try {
    body = (await request.json()) as ImportRequestBody;
  } catch {
    return NextResponse.json<ErrorResponse>({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (typeof body.raw !== "string" || body.raw.trim().length === 0) {
    return NextResponse.json<ErrorResponse>({ error: "Paste capture JSON first." }, { status: 400 });
  }

  try {
    const accountData = parseBrowserImport(body.raw);
    const analytics = buildAccountAnalytics(accountData);
    const savedScan = await saveAccountScan(accountData, analytics);
    const plannerJob = await enqueuePlannerJobForScan(savedScan.scanId);

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
    return NextResponse.json<ErrorResponse>({ error: "Unable to analyse capture." }, { status: 500 });
  }
}
