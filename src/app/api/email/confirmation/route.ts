import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendConfirmationEmail } from "@/lib/email/send-confirmation";
import { emailConfirmationSchema } from "@/lib/schemas/api";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`email:${user.id}`, 3, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = emailConfirmationSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const { registrationId } = parsed.data;

  // Verify the user owns this registration
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

  if (reg.created_by_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await sendConfirmationEmail(registrationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[email/confirmation] Failed", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
