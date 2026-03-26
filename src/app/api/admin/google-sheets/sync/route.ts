import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { syncAllToSheets, isConfigured } from "@/lib/services/google-sheets.service";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Google Sheets integration is not configured" },
      { status: 400 }
    );
  }

  const { eventId } = await request.json();
  if (!eventId) {
    return NextResponse.json(
      { error: "eventId is required" },
      { status: 400 }
    );
  }

  try {
    const result = await syncAllToSheets(eventId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: `Sync failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
