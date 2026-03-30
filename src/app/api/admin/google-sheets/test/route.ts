import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { isConfigured, SHEET_NAMES, getSheetStatus } from "@/lib/services/google-sheets.service";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isConfigured()) {
    return NextResponse.json(
      {
        error:
          "GOOGLE_APPS_SCRIPT_URL is not set. Add it to your environment variables.",
      },
      { status: 400 }
    );
  }

  const start = Date.now();
  try {
    const status = await getSheetStatus();
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      success: true,
      latencyMs,
      sheets: status,
      sheetNames: Object.values(SHEET_NAMES),
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    return NextResponse.json(
      {
        error: `Apps Script call failed after ${latencyMs}ms: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502 }
    );
  }
}
