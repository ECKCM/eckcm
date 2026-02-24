import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CheckinResult {
  status: "checked_in" | "already_checked_in" | "error";
  person?: {
    name: string;
    koreanName: string | null;
  };
  event?: {
    name: string;
    year: number;
  };
  confirmationCode?: string;
  checkinType?: string;
  error?: string;
}

/**
 * Verify an E-Pass token and record a check-in.
 */
export async function verifyAndCheckin(
  supabase: SupabaseClient,
  params: {
    token: string;
    checkinType: string;
    sessionId?: string | null;
    checkedInBy: string;
  }
): Promise<{ result: CheckinResult; statusCode: number }> {
  const { token, checkinType, sessionId, checkedInBy } = params;

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { data: epass, error: epassError } = await supabase
    .from("eckcm_epass_tokens")
    .select(
      `
      id,
      person_id,
      registration_id,
      is_active,
      eckcm_people!inner(first_name_en, last_name_en, display_name_ko),
      eckcm_registrations!inner(
        confirmation_code,
        status,
        event_id,
        eckcm_events!inner(name_en, year)
      )
    `
    )
    .eq("token_hash", tokenHash)
    .single();

  if (epassError || !epass) {
    return {
      result: { status: "error", error: "Invalid E-Pass token" },
      statusCode: 404,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = epass as any;
  const person = {
    name: `${data.eckcm_people.first_name_en} ${data.eckcm_people.last_name_en}`,
    koreanName: data.eckcm_people.display_name_ko,
  };

  if (!data.is_active) {
    return {
      result: { status: "error", error: "E-Pass is inactive", person },
      statusCode: 403,
    };
  }

  if (data.eckcm_registrations.status !== "PAID") {
    return {
      result: { status: "error", error: "Registration is not paid", person },
      statusCode: 403,
    };
  }

  const { error: checkinError } = await supabase
    .from("eckcm_checkins")
    .insert({
      person_id: data.person_id,
      event_id: data.eckcm_registrations.event_id,
      session_id: sessionId || null,
      checkin_type: checkinType,
      checked_in_by: checkedInBy,
    });

  if (checkinError) {
    if (checkinError.code === "23505") {
      return {
        result: {
          status: "already_checked_in",
          person,
          event: {
            name: data.eckcm_registrations.eckcm_events.name_en,
            year: data.eckcm_registrations.eckcm_events.year,
          },
          confirmationCode: data.eckcm_registrations.confirmation_code,
        },
        statusCode: 200,
      };
    }
    return {
      result: { status: "error", error: "Failed to record check-in" },
      statusCode: 500,
    };
  }

  return {
    result: {
      status: "checked_in",
      person,
      event: {
        name: data.eckcm_registrations.eckcm_events.name_en,
        year: data.eckcm_registrations.eckcm_events.year,
      },
      confirmationCode: data.eckcm_registrations.confirmation_code,
      checkinType,
    },
    statusCode: 200,
  };
}
