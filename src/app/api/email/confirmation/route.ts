import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendConfirmationEmail } from "@/lib/email/send-confirmation";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { registrationId } = await req.json();

  if (!registrationId) {
    return NextResponse.json(
      { error: "registrationId is required" },
      { status: 400 }
    );
  }

  // Verify the user owns this registration or is admin
  const { data: reg } = await supabase
    .from("eckcm_registrations")
    .select("id, created_by_user_id")
    .eq("id", registrationId)
    .single();

  if (!reg) {
    return NextResponse.json(
      { error: "Registration not found" },
      { status: 404 }
    );
  }

  try {
    await sendConfirmationEmail(registrationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[email/confirmation] Failed:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
