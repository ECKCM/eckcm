import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * GET /api/admin/search?q=...&event=<optional eventId>
 *
 * Powers the global admin search palette's registration lookup. Matches by
 * confirmation code, registrant name (English + Korean), email, or phone, then
 * returns a small, display-ready result set. Page/route matching is handled
 * client-side from the static nav index.
 *
 * Each result carries its `event_id` so the caller can deep-link straight to the
 * registration's detail view (/admin/registrations?view=<id>&event=<eventId>).
 */

interface SearchResult {
  id: string;
  confirmation_code: string;
  status: string;
  event_id: string;
  event_label: string | null;
  name: string;
  name_ko: string | null;
  people_count: number;
}

const RESULT_LIMIT = 12;

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const raw = (url.searchParams.get("q") ?? "").trim();
  const eventFilter = url.searchParams.get("event");

  if (raw.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // Sanitize for PostgREST or()/ilike filters: strip the characters that have
  // structural meaning in the filter grammar. `*` is the wildcard.
  const term = raw.replace(/[,()*%\\]/g, " ").trim();
  if (!term) {
    return NextResponse.json({ results: [] });
  }
  const pattern = `*${term}*`;

  const supabase = createAdminClient();

  // 1. People whose name / email / phone match → their person ids.
  const { data: people } = await supabase
    .from("eckcm_people")
    .select("id")
    .or(
      [
        `first_name_en.ilike.${pattern}`,
        `last_name_en.ilike.${pattern}`,
        `display_name_ko.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `phone.ilike.${pattern}`,
      ].join(",")
    )
    .limit(100);

  const personIds = Array.from(new Set((people ?? []).map((p) => p.id)));

  // 2. person ids → room-group ids → registration ids.
  const regIdsFromPeople = new Set<string>();
  if (personIds.length > 0) {
    const { data: memberships } = await supabase
      .from("eckcm_group_memberships")
      .select("group_id")
      .in("person_id", personIds);
    const groupIds = Array.from(
      new Set((memberships ?? []).map((m) => m.group_id).filter(Boolean))
    );
    if (groupIds.length > 0) {
      const { data: groups } = await supabase
        .from("eckcm_groups")
        .select("registration_id")
        .in("id", groupIds);
      for (const g of groups ?? []) {
        if (g.registration_id) regIdsFromPeople.add(g.registration_id);
      }
    }
  }

  // 3. Fetch matching registrations: direct confirmation-code matches +
  //    name/phone/email matches (via the registration ids gathered above).
  //    Two scoped queries kept simple, then merged & de-duped by id.
  const selectCols = `
    id,
    confirmation_code,
    status,
    event_id,
    created_at,
    eckcm_events(name_en, year),
    eckcm_groups(
      eckcm_group_memberships(
        role,
        eckcm_people!inner(first_name_en, last_name_en, display_name_ko)
      )
    )
  `;

  const byCodePromise = supabase
    .from("eckcm_registrations")
    .select(selectCols)
    .ilike("confirmation_code", pattern)
    .order("created_at", { ascending: false })
    .limit(RESULT_LIMIT);

  const byPeoplePromise =
    regIdsFromPeople.size > 0
      ? supabase
          .from("eckcm_registrations")
          .select(selectCols)
          .in("id", Array.from(regIdsFromPeople))
          .order("created_at", { ascending: false })
          .limit(RESULT_LIMIT * 2)
      : Promise.resolve({ data: [] as unknown[] });

  const [byCode, byPeople] = await Promise.all([byCodePromise, byPeoplePromise]);

  // Merge, de-dupe by id, optionally constrain to a single event.
  const merged = new Map<string, SearchResult>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ingest = (rows: any[]) => {
    for (const r of rows ?? []) {
      if (merged.has(r.id)) continue;
      if (eventFilter && r.event_id !== eventFilter) continue;

      // Representative name (fallback to first member), mirroring the table.
      const memberships = (r.eckcm_groups ?? []).flatMap(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (g: any) => g.eckcm_group_memberships ?? []
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rep =
        memberships.find((m: any) => m.role === "REPRESENTATIVE") ??
        memberships[0];
      const p = rep?.eckcm_people;
      const name = p
        ? `${p.first_name_en ?? ""} ${p.last_name_en ?? ""}`.trim() || "Unknown"
        : "Unknown";

      merged.set(r.id, {
        id: r.id,
        confirmation_code: r.confirmation_code,
        status: r.status,
        event_id: r.event_id,
        event_label: r.eckcm_events
          ? `${r.eckcm_events.name_en} (${r.eckcm_events.year})`
          : null,
        name,
        name_ko: p?.display_name_ko ?? null,
        people_count: memberships.length,
      });
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ingest((byCode as any).data ?? []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ingest((byPeople as any).data ?? []);

  return NextResponse.json({
    results: Array.from(merged.values()).slice(0, RESULT_LIMIT),
  });
}
