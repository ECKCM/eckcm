import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "crypto";
import { verifySignedCode } from "@/lib/services/epass.service";

interface CheckinItem {
  token?: string;
  participantCode?: string;
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

  const admin = createAdminClient();
  const results: SyncResult[] = [];

  // Fetch HMAC secret once for the batch
  const { data: appConfig } = await admin
    .from("eckcm_app_config")
    .select("epass_hmac_secret")
    .eq("id", 1)
    .single();
  const hmacSecret = (appConfig as any)?.epass_hmac_secret as string | null;

  for (const item of checkins) {
    try {
      let personId: string | null = null;
      let eventId: string | null = null;
      let regStatus: string | null = null;
      let isActive = true;

      if (item.participantCode) {
        // Resolve HMAC-signed participant code
        let resolvedCode = item.participantCode;
        if (item.participantCode.includes(".") && hmacSecret) {
          const { valid, participantCode: code } = verifySignedCode(
            item.participantCode,
            hmacSecret
          );
          if (!valid) {
            results.push({
              nonce: item.nonce,
              status: "error",
              error: "Invalid QR signature",
            });
            continue;
          }
          resolvedCode = code;
        }

        // Look up by participant code
        const { data: membership, error: memberError } = await admin
          .from("eckcm_group_memberships")
          .select(`
            person_id,
            eckcm_groups!inner(
              registration_id,
              eckcm_registrations!inner(status, event_id)
            )
          `)
          .eq("participant_code", resolvedCode)
          .single();

        if (memberError || !membership) {
          results.push({
            nonce: item.nonce,
            status: "error",
            error: "Invalid participant code",
          });
          continue;
        }

        const m = membership as any;
        personId = m.person_id;
        eventId = m.eckcm_groups.eckcm_registrations.event_id;
        regStatus = m.eckcm_groups.eckcm_registrations.status;

        // Check epass active status
        const { data: epass } = await admin
          .from("eckcm_epass_tokens")
          .select("is_active")
          .eq("person_id", personId!)
          .eq("registration_id", m.eckcm_groups.registration_id)
          .single();

        isActive = epass?.is_active ?? true;
      } else if (item.token) {
        // Look up by token hash
        const tokenHash = createHash("sha256").update(item.token).digest("hex");

        const { data: epass, error: epassError } = await supabase
          .from("eckcm_epass_tokens")
          .select(`
            id,
            person_id,
            registration_id,
            is_active,
            eckcm_registrations!inner(status, event_id)
          `)
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
        personId = data.person_id;
        eventId = data.eckcm_registrations.event_id;
        regStatus = data.eckcm_registrations.status;
        isActive = data.is_active;
      } else {
        results.push({
          nonce: item.nonce,
          status: "error",
          error: "token or participantCode required",
        });
        continue;
      }

      if (!isActive) {
        results.push({
          nonce: item.nonce,
          status: "error",
          error: "E-Pass is inactive",
        });
        continue;
      }

      if (regStatus !== "PAID") {
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
          person_id: personId,
          event_id: eventId,
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
