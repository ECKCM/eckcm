import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { computeMealCategory } from "@/lib/services/participant-lookup";

/**
 * Export the check-ins recorded under a single scan session as either an
 * Excel workbook (.xlsx) or a UTF-8 (BOM-prefixed) CSV.
 *
 * The downstream consumer is UPJ — they want a flat per-row table with
 * the participant's identifying info, meal context, and derived meal tier
 * so they can reconcile billing without rerunning queries.
 *
 *   GET /api/scan-sessions/{id}/export?format=xlsx       (default)
 *   GET /api/scan-sessions/{id}/export?format=csv
 *
 * Sandbox / simulation sessions are still exportable (useful for QA), but
 * the filename includes a "_simulation" tag so the operator can tell them
 * apart from the real meal records UPJ should be billed on.
 */

interface CheckinRow {
  checked_in_at: string;
  checkin_type: string;
  meal_date: string | null;
  meal_type: string | null;
  is_sandbox: boolean;
  eckcm_people: {
    first_name_en: string | null;
    last_name_en: string | null;
    display_name_ko: string | null;
    gender: string | null;
    birth_date: string | null;
  } | null;
  eckcm_registrations: {
    confirmation_code: string | null;
    status: string | null;
  } | null;
}

interface SessionRow {
  id: string;
  label: string | null;
  kind: string;
  meal_date: string | null;
  is_sandbox: boolean;
  started_at: string;
  ended_at: string | null;
  event_id: string;
}

interface EventRow {
  name_en: string;
  year: number;
  event_start_date: string | null;
}

function categoryLabel(
  birthDate: string | null,
  eventStart: string | null
): string {
  const cat = computeMealCategory(birthDate, eventStart);
  if (cat === "adult") return "General";
  if (cat === "youth") return "Youth";
  if (cat === "free") return "Free";
  return "";
}

function safeFileTag(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 60);
}

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const HEADERS = [
  "Row",
  "Checked In (ET)",
  "Confirmation",
  "Participant Code",
  "First Name",
  "Last Name",
  "Korean Name",
  "Gender",
  "Birth Date",
  "Meal Tier",
  "Check-in Type",
  "Meal Date",
  "Meal Type",
  "Registration Status",
  "Sandbox",
] as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(_req.url);
  const format = (url.searchParams.get("format") ?? "xlsx").toLowerCase();
  if (format !== "xlsx" && format !== "csv") {
    return NextResponse.json(
      { error: "format must be xlsx or csv" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: session, error: sErr } = await admin
    .from("eckcm_scan_sessions")
    .select(
      "id, label, kind, meal_date, is_sandbox, started_at, ended_at, event_id"
    )
    .eq("id", id)
    .single();
  if (sErr || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const s = session as SessionRow;

  const { data: ev } = await admin
    .from("eckcm_events")
    .select("name_en, year, event_start_date")
    .eq("id", s.event_id)
    .single();
  const event = (ev as EventRow | null) ?? null;

  // Need participant_code separately — eckcm_checkins doesn't carry it.
  // Group memberships row per (person, registration) gives it.
  const { data: rawCheckins } = await admin
    .from("eckcm_checkins")
    .select(
      `
      checked_in_at,
      checkin_type,
      meal_date,
      meal_type,
      is_sandbox,
      person_id,
      registration_id,
      eckcm_people!inner(first_name_en, last_name_en, display_name_ko, gender, birth_date),
      eckcm_registrations(confirmation_code, status)
    `
    )
    .eq("scan_session_id", id)
    .order("checked_in_at", { ascending: true });
  const checkins = (rawCheckins ?? []) as unknown as (CheckinRow & {
    person_id: string;
    registration_id: string | null;
  })[];

  // Lookup participant_code per (person, registration). One query.
  const personIds = [...new Set(checkins.map((c) => c.person_id))];
  const regIds = [
    ...new Set(checkins.map((c) => c.registration_id).filter(Boolean) as string[]),
  ];
  const codeByKey = new Map<string, string>();
  if (personIds.length && regIds.length) {
    const { data: memberships } = await admin
      .from("eckcm_group_memberships")
      .select("person_id, participant_code, eckcm_groups!inner(registration_id)")
      .in("person_id", personIds)
      .in("eckcm_groups.registration_id", regIds);
    for (const m of (memberships ?? []) as unknown as {
      person_id: string;
      participant_code: string | null;
      eckcm_groups: { registration_id: string };
    }[]) {
      if (!m.participant_code) continue;
      const key = `${m.person_id}:${m.eckcm_groups.registration_id}`;
      // First-seen wins; participant_code rotation is rare.
      if (!codeByKey.has(key)) codeByKey.set(key, m.participant_code);
    }
  }

  const eventStartDate = event?.event_start_date ?? null;

  const rows = checkins.map((c, i) => {
    const p = c.eckcm_people;
    const r = c.eckcm_registrations;
    const code =
      c.registration_id && codeByKey.get(`${c.person_id}:${c.registration_id}`)
        ? codeByKey.get(`${c.person_id}:${c.registration_id}`)!
        : "";
    return [
      i + 1,
      new Date(c.checked_in_at).toLocaleString("en-US", {
        timeZone: "America/New_York",
      }),
      r?.confirmation_code ?? "",
      code,
      p?.first_name_en ?? "",
      p?.last_name_en ?? "",
      p?.display_name_ko ?? "",
      p?.gender ?? "",
      p?.birth_date ?? "",
      categoryLabel(p?.birth_date ?? null, eventStartDate),
      c.checkin_type,
      c.meal_date ?? "",
      c.meal_type ?? "",
      r?.status ?? "",
      c.is_sandbox ? "YES" : "",
    ];
  });

  const fileTag = `${safeFileTag(s.label ?? s.kind)}_${s.meal_date ?? "session"}${
    s.is_sandbox ? "_simulation" : ""
  }`;

  if (format === "csv") {
    // UTF-8 BOM so Excel for Windows opens Korean correctly.
    const lines = [HEADERS.map(csvEscape).join(",")];
    for (const r of rows) lines.push(r.map(csvEscape).join(","));
    const body = "﻿" + lines.join("\r\n") + "\r\n";
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="checkins_${fileTag}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // xlsx
  const wb = new ExcelJS.Workbook();
  wb.creator = "eckcm kiosk";
  wb.created = new Date(s.started_at);
  const ws = wb.addWorksheet("Check-ins");
  ws.columns = HEADERS.map((h) => ({
    header: h,
    key: h,
    width: Math.max(12, h.length + 4),
  }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
  for (const r of rows) ws.addRow(r);

  // Summary sheet — gives UPJ a one-glance total they can paste into reports.
  const summary = wb.addWorksheet("Summary");
  const tally = { general: 0, youth: 0, free: 0, unknown: 0 };
  for (const r of rows) {
    const tier = r[9] as string;
    if (tier === "General") tally.general++;
    else if (tier === "Youth") tally.youth++;
    else if (tier === "Free") tally.free++;
    else tally.unknown++;
  }
  summary.columns = [
    { header: "Field", key: "field", width: 28 },
    { header: "Value", key: "value", width: 50 },
  ];
  summary.getRow(1).font = { bold: true };
  summary.addRows([
    ["Event", event ? `${event.name_en} (${event.year})` : ""],
    ["Session Label", s.label ?? ""],
    ["Session Kind", s.kind],
    ["Meal Date", s.meal_date ?? ""],
    ["Sandbox / Simulation", s.is_sandbox ? "YES" : "NO"],
    ["Started (ET)", new Date(s.started_at).toLocaleString("en-US", { timeZone: "America/New_York" })],
    [
      "Ended (ET)",
      s.ended_at
        ? new Date(s.ended_at).toLocaleString("en-US", { timeZone: "America/New_York" })
        : "(still active)",
    ],
    ["Total Check-ins", rows.length],
    ["General", tally.general],
    ["Youth", tally.youth],
    ["Free", tally.free],
    ["Unknown", tally.unknown],
  ]);

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="checkins_${fileTag}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
