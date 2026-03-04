import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminCheck = await requireAdmin();
  if (!adminCheck) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { type } = await request.json();

  // Bulk PDF export not yet implemented (use /api/invoice/[id]/pdf for individual PDFs)
  return NextResponse.json(
    {
      error: "Bulk PDF export is not yet configured",
      message: `Bulk PDF export for '${type}' is not yet implemented.`,
    },
    { status: 501 }
  );
}
