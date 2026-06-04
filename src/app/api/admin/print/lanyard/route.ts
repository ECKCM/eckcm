import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { signParticipantCode } from "@/lib/services/epass.service";

/**
 * GET /api/admin/print/lanyard?eventId=xxx&status=PAID
 *
 * Returns one badge record per participant for the Avery 5390 lanyard print sheet.
 * The QR value is the HMAC-signed participant code (same value the public E-Pass
 * page renders) so the existing check-in scanner (`parseQRValue`) recognizes it.
 *
 * CANCELLED / REFUNDED / DRAFT registrations are always excluded.
 */

// Statuses that may appear on a badge. Cancelled/refunded/draft are never printable.
const PRINTABLE_STATUSES = ["SUBMITTED", "APPROVED", "PAID"] as const;

export async function GET(req: NextRequest) {
  const adminAuth = await requireAdmin();
  if (!adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = req.nextUrl.searchParams.get("eventId");
  const status = req.nextUrl.searchParams.get("status");

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  // Resolve which statuses to include. "ALL" = every printable status.
  const statuses =
    status && status !== "ALL" && (PRINTABLE_STATUSES as readonly string[]).includes(status)
      ? [status]
      : [...PRINTABLE_STATUSES];

  const admin = createAdminClient();

  // Event meta (English + Korean names + year) and HMAC secret for QR signing.
  const [eventResult, configResult, titlesResult] = await Promise.all([
    admin
      .from("eckcm_events")
      .select("name_en, name_ko, year")
      .eq("id", eventId)
      .single(),
    admin
      .from("eckcm_app_config")
      .select("epass_hmac_secret")
      .eq("id", 1)
      .single(),
    admin.from("eckcm_participant_titles").select("id, name, color, icon"),
  ]);

  if (eventResult.error) {
    return NextResponse.json({ error: eventResult.error.message }, { status: 500 });
  }

  const secret =
    (configResult.data as { epass_hmac_secret?: string | null } | null)
      ?.epass_hmac_secret ?? null;

  const titleById = new Map<
    string,
    { name: string; color: string | null; icon: string | null }
  >();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of (titlesResult.data ?? []) as any[]) {
    titleById.set(t.id, { name: t.name, color: t.color ?? null, icon: t.icon ?? null });
  }

  // Participants: one row per group membership, excluding cancelled/refunded/draft.
  const { data: memberships, error: memberError } = await admin
    .from("eckcm_group_memberships")
    .select(
      `
      participant_code,
      role,
      title_id,
      eckcm_people!inner(
        first_name_en, last_name_en, display_name_ko,
        church_other,
        eckcm_churches(name_en)
      ),
      eckcm_groups!inner(
        display_group_code,
        event_id,
        eckcm_registrations!inner(confirmation_code, status)
      )
    `
    )
    .eq("eckcm_groups.event_id", eventId)
    .in("eckcm_groups.eckcm_registrations.status", statuses);

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const badges = ((memberships ?? []) as any[]).map((m) => {
    const p = m.eckcm_people;
    const group = m.eckcm_groups;
    const reg = group?.eckcm_registrations;
    const participantCode: string | null = m.participant_code ?? null;

    // QR carries the signed participant code — falls back to the plain code when
    // no HMAC secret is configured. Scanner accepts both formats.
    let qrValue: string | null = participantCode;
    if (participantCode && secret) {
      qrValue = signParticipantCode(participantCode, secret);
    }

    const title = m.title_id ? titleById.get(m.title_id) ?? null : null;

    // "No Home Church" is a placeholder selection, not a real church — omit it
    // from the badge. Normalization matches the convention used in profile/register.
    const churchRaw = p.church_other || p.eckcm_churches?.name_en || null;
    const church =
      churchRaw && churchRaw.replace(/\W/g, "").toLowerCase() === "nohomechurch"
        ? null
        : churchRaw;

    return {
      nameEn: `${p.first_name_en ?? ""} ${p.last_name_en ?? ""}`.trim(),
      nameKo: (p.display_name_ko as string | null) ?? null,
      church,
      groupCode: (group?.display_group_code as string | null) ?? null,
      title,
      role: (m.role as string | null) ?? "MEMBER",
      confirmationCode: (reg?.confirmation_code as string | null) ?? null,
      participantCode,
      qrValue,
    };
  });

  // Stable, group-then-name ordering so reprints land in the same place.
  badges.sort((a, b) => {
    const g = (a.groupCode ?? "").localeCompare(b.groupCode ?? "");
    if (g !== 0) return g;
    return (a.nameKo ?? a.nameEn).localeCompare(b.nameKo ?? b.nameEn, "ko");
  });

  const event = eventResult.data as {
    name_en: string | null;
    name_ko: string | null;
    year: number | null;
  };

  return NextResponse.json({
    event: {
      nameEn: event.name_en ?? "East Coast Korean Camp Meeting",
      nameKo: event.name_ko ?? null,
      year: event.year ?? null,
    },
    badges,
  });
}
