import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  pickBestMembership,
  type MembershipCodeRow,
} from "@/lib/services/participant-code.service";
import { logger } from "@/lib/logger";
import { EPassLinksClient, type EPassLinkRow } from "./epass-links-client";

export const dynamic = "force-dynamic";

// Registrations that should never surface a public E-Pass link.
const EXCLUDED_STATUSES = new Set(["REFUNDED", "CANCELLED", "DRAFT"]);

/**
 * Public E-Pass slug: "FirstNameLastName_<token>". Names are stripped to
 * alphanumerics so the first "_" is always the token separator (mirrors
 * buildEPassUrl / extractTokenFromSlug).
 */
function buildEPassSlug(
  firstName: string,
  lastName: string,
  token: string,
): string {
  const name = `${firstName}${lastName}`.replace(/[^a-zA-Z0-9]/g, "");
  return `${name}_${token}`;
}

/**
 * Load every public E-Pass link for an event.
 *
 * A "link" exists only where an e-pass token exists, so we list tokens — not
 * memberships. A token is kept only when the person still has a membership in
 * that registration (drops ghost tokens left behind by a transfer) and the
 * registration isn't cancelled/refunded/draft. participant_code comes from the
 * batch-loaded memberships (no per-row self-heal — this is a read-only listing;
 * the public page heals a NULL code on view).
 */
async function loadEPassLinks(eventId: string): Promise<EPassLinkRow[]> {
  const admin = createAdminClient();

  // 1. All e-pass tokens for the event. Page through results — an event can
  //    have well over 1000 participants (Supabase caps a query at 1000 rows).
  const PAGE = 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokens: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("eckcm_epass_tokens")
      .select(
        `
        token, is_active, person_id, registration_id,
        eckcm_people!inner(first_name_en, last_name_en, display_name_ko, gender, phone),
        eckcm_registrations!inner(confirmation_code, status, event_id)
      `,
      )
      .eq("eckcm_registrations.event_id", eventId)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      logger.error("[admin/epass] Failed to load tokens", {
        eventId,
        error: String(error),
      });
      break;
    }
    if (!data || data.length === 0) break;
    tokens.push(...data);
    if (data.length < PAGE) break;
  }

  if (tokens.length === 0) return [];

  // 2. Memberships for those registrations → participant_code + the
  //    "person belongs to this registration" check. Chunk registration ids so
  //    the .in() URL can't overflow (events have 400+ registrations).
  const regIds = [...new Set(tokens.map((t) => t.registration_id))];
  const rowsByKey = new Map<string, MembershipCodeRow[]>();
  const CHUNK = 80;
  for (let i = 0; i < regIds.length; i += CHUNK) {
    const chunk = regIds.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("eckcm_group_memberships")
      .select(
        "id, person_id, participant_code, status, created_at, eckcm_groups!inner(registration_id)",
      )
      .in("eckcm_groups.registration_id", chunk);

    if (error) {
      logger.error("[admin/epass] Failed to load memberships", {
        eventId,
        error: String(error),
      });
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of (data ?? []) as any[]) {
      const regId = m.eckcm_groups?.registration_id;
      if (!regId) continue;
      const key = `${m.person_id}:${regId}`;
      const list = rowsByKey.get(key) ?? [];
      list.push(m);
      rowsByKey.set(key, list);
    }
  }

  const codeFor = (personId: string, registrationId: string): string | null => {
    const rows = rowsByKey.get(`${personId}:${registrationId}`);
    if (!rows) return null;
    return pickBestMembership(rows)?.participant_code ?? null;
  };

  // 3. Build the link rows.
  const rows: EPassLinkRow[] = [];
  for (const t of tokens) {
    const key = `${t.person_id}:${t.registration_id}`;
    if (!rowsByKey.has(key)) continue; // ghost token — person transferred away
    const status = t.eckcm_registrations?.status as string | undefined;
    if (status && EXCLUDED_STATUSES.has(status)) continue;

    const person = t.eckcm_people;
    const firstName = person?.first_name_en ?? "";
    const lastName = person?.last_name_en ?? "";
    rows.push({
      personId: t.person_id,
      name: `${firstName} ${lastName}`.trim(),
      displayNameKo: person?.display_name_ko ?? null,
      gender: person?.gender ?? null,
      phone: person?.phone ?? null,
      participantCode: codeFor(t.person_id, t.registration_id),
      confirmationCode: t.eckcm_registrations?.confirmation_code ?? null,
      status: status ?? null,
      isActive: !!t.is_active,
      slug: buildEPassSlug(firstName, lastName, t.token),
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export default async function AdminEPassPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year, is_default")
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  const eventList = events ?? [];
  const selectedEventId = sp.event ?? eventList[0]?.id ?? null;
  const rows = selectedEventId ? await loadEPassLinks(selectedEventId) : [];

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">E-Pass Links</h1>
      </div>
      <div className="p-6">
        <EPassLinksClient
          events={eventList}
          selectedEventId={selectedEventId}
          rows={rows}
        />
      </div>
    </div>
  );
}
