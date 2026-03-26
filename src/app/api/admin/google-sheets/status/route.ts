import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getSheetStatus, isConfigured, SHEET_NAMES } from "@/lib/services/google-sheets.service";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configured = isConfigured();
  if (!configured) {
    return NextResponse.json({
      configured: false,
      sheetId: null,
      sheets: null,
    });
  }

  const status = await getSheetStatus();

  return NextResponse.json({
    configured: true,
    sheetId: process.env.GOOGLE_SHEET_ID,
    sheetNames: SHEET_NAMES,
    sheets: status,
  });
}
