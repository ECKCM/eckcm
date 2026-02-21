import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createHash } from "crypto";

interface CheckinItem {
  token: string;
  checkinType: string;
  sessionId?: string | null;
  nonce: string;
  timestamp: string;
}

interface SyncResult {
  nonce: string;
  status: "checked_in" | "already_checked_in" | "error";
  error?: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { checkins } = body as { checkins: CheckinItem[] };

  if (!checkins || !Array.isArray(checkins) || checkins.length === 0) {
    return NextResponse.json(
      { error: "checkins array is required" },
      { status: 400 }
    );
  }

  const results: SyncResult[] = [];

  for (const item of checkins) {
    try {
      const tokenHash = createHash("sha256").update(item.token).digest("hex");

      const { data: epass, error: epassError } = await supabase
        .from("eckcm_epass_tokens")
        .select(
          `
          id,
          person_id,
          registration_id,
          is_active,
          eckcm_registrations!inner(
            status,
            event_id
          )
        `
        )
        .eq("token_hash", tokenHash)
        .single();

      if (epassError || !epass) {
        results.push({
          nonce: item.nonce,
          status: "error",
          error: "Invalid E-Pass token",
        });
        continue;
      }

      const data = epass as any;

      if (!data.is_active) {
        results.push({
          nonce: item.nonce,
          status: "error",
          error: "E-Pass is inactive",
        });
        continue;
      }

      if (data.eckcm_registrations.status !== "PAID") {
        results.push({
          nonce: item.nonce,
          status: "error",
          error: "Registration is not paid",
        });
        continue;
      }

      const { error: checkinError } = await supabase
        .from("eckcm_checkins")
        .insert({
          person_id: data.person_id,
          event_id: data.eckcm_registrations.event_id,
          session_id: item.sessionId || null,
          checkin_type: item.checkinType || "MAIN",
          checked_in_by: user.id,
          nonce: item.nonce,
        });

      if (checkinError) {
        if (checkinError.code === "23505") {
          results.push({ nonce: item.nonce, status: "already_checked_in" });
        } else {
          results.push({
            nonce: item.nonce,
            status: "error",
            error: "Failed to record check-in",
          });
        }
        continue;
      }

      results.push({ nonce: item.nonce, status: "checked_in" });
    } catch {
      results.push({
        nonce: item.nonce,
        status: "error",
        error: "Unexpected error",
      });
    }
  }

  return NextResponse.json({ results });
}
