import { NextRequest, NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { importHistoricalSnapshot, listHistoricalSnapshots, reparseHistoricalSnapshotFollowers, type ReparseFollowerResult, type SnapshotImportResult } from "@/lib/history/snapshots";

export const dynamic = "force-dynamic";

type ErrorResponse = { error: string };

type SnapshotListResponse = {
  snapshots: Awaited<ReturnType<typeof listHistoricalSnapshots>>;
};

function parseLocalDateTime(dateValue: string, timeValue: string, timezone = "Europe/London"): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) throw new Error("Enter a valid snapshot date.");
  if (!/^\d{2}:\d{2}$/.test(timeValue)) throw new Error("Enter a valid snapshot time.");

  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(formatter.formatToParts(new Date(utcGuess)).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
  const offset = zonedAsUtc - utcGuess;
  const corrected = new Date(utcGuess - offset);

  if (Number.isNaN(corrected.getTime())) throw new Error("Could not parse snapshot date/time.");
  return corrected;
}

async function contentFromForm(form: FormData): Promise<{ content: string; fileName: string | null }> {
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 12 * 1024 * 1024) throw new Error("Snapshot file is too large. Keep imports under 12 MB for now.");
    return { content: await file.text(), fileName: file.name };
  }

  const pasted = form.get("content");
  if (typeof pasted === "string" && pasted.trim().length > 0) {
    return { content: pasted, fileName: null };
  }

  throw new Error("Upload a .txt/.html file or paste the snapshot HTML/JSON.");
}

export async function GET(): Promise<NextResponse<SnapshotListResponse | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  try {
    const snapshots = await listHistoricalSnapshots(user.id);
    return NextResponse.json({ snapshots });
  } catch (error) {
    return NextResponse.json<ErrorResponse>({ error: error instanceof Error ? error.message : "Unable to load historical snapshots." }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<SnapshotImportResult | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  try {
    const form = await request.formData();
    const capturedDate = String(form.get("capturedDate") ?? "");
    const capturedTime = String(form.get("capturedTime") ?? "");
    const timezone = String(form.get("timezone") ?? "Europe/London") || "Europe/London";
    const capturedAt = parseLocalDateTime(capturedDate, capturedTime, timezone);
    const { content, fileName } = await contentFromForm(form);
    const label = typeof form.get("sourceFileName") === "string" && String(form.get("sourceFileName")).trim().length > 0 ? String(form.get("sourceFileName")).trim() : fileName;
    const username = typeof form.get("username") === "string" && String(form.get("username")).trim().length > 0 ? String(form.get("username")).trim().replace(/^u\//i, "") : null;

    const result = await importHistoricalSnapshot({
      ownerUserId: user.id,
      capturedAt,
      content,
      sourceFileName: label,
      username,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json<ErrorResponse>({ error: error instanceof Error ? error.message : "Unable to import historical snapshot." }, { status: 400 });
  }
}

export async function PATCH(): Promise<NextResponse<ReparseFollowerResult | ErrorResponse>> {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json<ErrorResponse>({ error: "Sign in first." }, { status: 401 });

  try {
    const result = await reparseHistoricalSnapshotFollowers(user.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json<ErrorResponse>({ error: error instanceof Error ? error.message : "Unable to reparse historical followers." }, { status: 500 });
  }
}
