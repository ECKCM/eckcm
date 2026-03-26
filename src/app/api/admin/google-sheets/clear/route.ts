import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/admin";
import { clearAllSheets, isConfigured } from "@/lib/services/google-sheets.service";

export async function POST() {
  const auth = await requireSuperAdmin();
  if (!auth) {
    return NextResponse.json(
      { error: "Only SUPER_ADMIN can clear Google Sheets" },
      { status: 403 }
    );
  }

  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Google Sheets integration is not configured" },
      { status: 400 }
    );
  }

  try {
    await clearAllSheets();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: `Clear failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
