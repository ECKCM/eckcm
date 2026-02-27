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

  // PDF generation requires a library like puppeteer or @react-pdf/renderer
  // This is a placeholder that returns an error until a PDF library is configured
  return NextResponse.json(
    {
      error: "PDF export is not yet configured",
      message: `PDF export for '${type}' requires server-side PDF generation. Configure @react-pdf/renderer or puppeteer.`,
    },
    { status: 501 }
  );
}
