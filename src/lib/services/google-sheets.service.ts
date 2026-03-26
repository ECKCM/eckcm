import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL ?? "";

export const SHEET_NAMES = {
  ORIGINAL: "Original Registration",
  SYNC: "Sync Registration",
  COPY: "Copy of Registration",
  PARTICIPANTS: "Participants",
  MEALS: "Meal Data",
} as const;

// ---------------------------------------------------------------------------
// Headers (column definitions) for each sheet
// ---------------------------------------------------------------------------

export const REGISTRATION_HEADERS = [
  "Confirmation Code",
  "Status",
  "Registration Type",
  "Representative First Name",
  "Representative Last Name",
  "Representative Korean Name",
  "Representative Email",
  "Representative Phone",
  "Start Date",
  "End Date",
  "Nights",
  "Total Amount ($)",
  "Payment Status",
  "Payment Method",
  "Group Count",
  "Participant Count",
  "Lodging Type",
  "Additional Requests",
  "Notes",
  "Registration Group",
  "Cancelled At",
  "Cancellation Reason",
  "Created At",
  "Updated At",
];

export const PARTICIPANT_HEADERS = [
  "Participant Code",
  "Confirmation Code",
  "Group Code",
  "Role",
  "Status",
  "First Name",
  "Last Name",
  "Korean Name",
  "Gender",
  "Birth Date",
  "Age at Event",
  "K-12",
  "Grade",
  "Email",
  "Phone",
  "Phone Country",
  "Church",
  "Church (Other)",
  "Department",
  "Lodging Type",
  "Guardian Name",
  "Guardian Phone",
  "Guardian Phone Country",
];

export const MEAL_HEADERS = [
  "Confirmation Code",
  "First Name",
  "Last Name",
  "Date",
  "Breakfast",
  "Lunch",
  "Dinner",
];

// ---------------------------------------------------------------------------
// Apps Script HTTP helper
// ---------------------------------------------------------------------------

export function isConfigured(): boolean {
  return !!APPS_SCRIPT_URL;
}

async function callAppsScript(
  action: string,
  data?: Record<string, unknown>
): Promise<any> {
  if (!APPS_SCRIPT_URL) throw new Error("Google Apps Script URL not configured");

  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...data }),
    redirect: "follow",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apps Script error (${res.status}): ${text}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Sheet tab management
// ---------------------------------------------------------------------------

/** Ensure all 5 sheet tabs exist with correct headers. Creates missing tabs. */
export async function ensureSheets(): Promise<void> {
  if (!APPS_SCRIPT_URL) return;
  await callAppsScript("ensureSheets", {
    sheetNames: Object.values(SHEET_NAMES),
    headers: {
      [SHEET_NAMES.ORIGINAL]: REGISTRATION_HEADERS,
      [SHEET_NAMES.SYNC]: REGISTRATION_HEADERS,
      [SHEET_NAMES.COPY]: REGISTRATION_HEADERS,
      [SHEET_NAMES.PARTICIPANTS]: PARTICIPANT_HEADERS,
      [SHEET_NAMES.MEALS]: MEAL_HEADERS,
    },
  });
}

/** Update headers on all sheets (call when columns change). */
export async function syncHeaders(): Promise<void> {
  await ensureSheets();
}

// ---------------------------------------------------------------------------
// Data fetching from Supabase
// ---------------------------------------------------------------------------

interface RegistrationRow {
  confirmation_code: string;
  status: string;
  registration_type: string;
  start_date: string;
  end_date: string;
  nights_count: number;
  total_amount_cents: number;
  additional_requests: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  registration_group: { name_en: string } | null;
  rep_first_name: string;
  rep_last_name: string;
  rep_korean_name: string;
  rep_email: string;
  rep_phone: string;
  group_count: number;
  participant_count: number;
  lodging_type: string;
  payment_status: string;
  payment_method: string;
}

async function fetchRegistrations(eventId: string): Promise<RegistrationRow[]> {
  const admin = createAdminClient();

  const { data: registrations } = await admin
    .from("eckcm_registrations")
    .select(`
      id, confirmation_code, status, registration_type,
      start_date, end_date, nights_count, total_amount_cents,
      additional_requests, notes, created_at, updated_at,
      cancelled_at, cancellation_reason,
      eckcm_registration_groups(name_en)
    `)
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (!registrations?.length) return [];

  const regIds = registrations.map((r: any) => r.id);

  // Fetch groups, memberships, people, payments in parallel
  const [groupsRes, invoicesRes] = await Promise.all([
    admin
      .from("eckcm_groups")
      .select(`
        id, registration_id, display_group_code, lodging_type,
        eckcm_group_memberships(
          role, person_id,
          eckcm_people(first_name_en, last_name_en, display_name_ko, email, phone)
        )
      `)
      .in("registration_id", regIds),
    admin
      .from("eckcm_invoices")
      .select(`
        registration_id,
        eckcm_payments(status, payment_method)
      `)
      .in("registration_id", regIds),
  ]);

  const groups = groupsRes.data ?? [];
  const invoices = invoicesRes.data ?? [];

  // Build lookup maps
  const groupsByReg = new Map<string, any[]>();
  for (const g of groups) {
    const list = groupsByReg.get(g.registration_id) ?? [];
    list.push(g);
    groupsByReg.set(g.registration_id, list);
  }

  const paymentByReg = new Map<string, { status: string; method: string }>();
  for (const inv of invoices as any[]) {
    const payments = inv.eckcm_payments ?? [];
    const successPayment = payments.find((p: any) => p.status === "SUCCEEDED") ?? payments[0];
    if (successPayment) {
      paymentByReg.set(inv.registration_id, {
        status: successPayment.status,
        method: successPayment.payment_method ?? "",
      });
    }
  }

  return registrations.map((reg: any) => {
    const regGroups = groupsByReg.get(reg.id) ?? [];
    let repFirst = "";
    let repLast = "";
    let repKorean = "";
    let repEmail = "";
    let repPhone = "";
    let totalParticipants = 0;
    let lodgingType = "";

    for (const g of regGroups) {
      if (!lodgingType && g.lodging_type) lodgingType = g.lodging_type;
      const memberships = g.eckcm_group_memberships ?? [];
      totalParticipants += memberships.length;
      for (const m of memberships) {
        if (m.role === "REPRESENTATIVE" && !repFirst) {
          const person = m.eckcm_people;
          repFirst = person?.first_name_en ?? "";
          repLast = person?.last_name_en ?? "";
          repKorean = person?.display_name_ko ?? "";
          repEmail = person?.email ?? "";
          repPhone = person?.phone ?? "";
        }
      }
    }

    const payment = paymentByReg.get(reg.id);

    return {
      confirmation_code: reg.confirmation_code,
      status: reg.status,
      registration_type: reg.registration_type,
      start_date: reg.start_date,
      end_date: reg.end_date,
      nights_count: reg.nights_count,
      total_amount_cents: reg.total_amount_cents,
      additional_requests: reg.additional_requests,
      notes: reg.notes,
      created_at: reg.created_at,
      updated_at: reg.updated_at,
      cancelled_at: reg.cancelled_at,
      cancellation_reason: reg.cancellation_reason,
      registration_group: reg.eckcm_registration_groups,
      rep_first_name: repFirst,
      rep_last_name: repLast,
      rep_korean_name: repKorean,
      rep_email: repEmail,
      rep_phone: repPhone,
      group_count: regGroups.length,
      participant_count: totalParticipants,
      lodging_type: lodgingType,
      payment_status: payment?.status ?? "",
      payment_method: payment?.method ?? "",
    };
  });
}

function registrationToRow(r: RegistrationRow): (string | number)[] {
  return [
    r.confirmation_code,
    r.status,
    r.registration_type,
    r.rep_first_name,
    r.rep_last_name,
    r.rep_korean_name,
    r.rep_email,
    r.rep_phone,
    r.start_date,
    r.end_date,
    r.nights_count,
    (r.total_amount_cents / 100).toFixed(2),
    r.payment_status,
    r.payment_method,
    r.group_count,
    r.participant_count,
    r.lodging_type,
    r.additional_requests ?? "",
    r.notes ?? "",
    r.registration_group?.name_en ?? "",
    r.cancelled_at ?? "",
    r.cancellation_reason ?? "",
    r.created_at,
    r.updated_at,
  ];
}

interface ParticipantRow {
  participant_code: string;
  confirmation_code: string;
  group_code: string;
  role: string;
  membership_status: string;
  first_name: string;
  last_name: string;
  korean_name: string;
  gender: string;
  birth_date: string;
  age_at_event: number | null;
  is_k12: boolean;
  grade: string;
  email: string;
  phone: string;
  phone_country: string;
  church: string;
  church_other: string;
  department: string;
  lodging_type: string;
  guardian_name: string;
  guardian_phone: string;
  guardian_phone_country: string;
}

async function fetchParticipants(eventId: string): Promise<ParticipantRow[]> {
  const admin = createAdminClient();

  // Step 1: Get registration IDs and confirmation codes for this event
  const { data: registrations } = await admin
    .from("eckcm_registrations")
    .select("id, confirmation_code")
    .eq("event_id", eventId);

  if (!registrations?.length) return [];

  const regIds = registrations.map((r: any) => r.id);
  const confirmationMap = new Map(
    registrations.map((r: any) => [r.id, r.confirmation_code])
  );

  // Step 2: Get groups with memberships and people
  const { data: groups } = await admin
    .from("eckcm_groups")
    .select(`
      display_group_code, registration_id, lodging_type,
      eckcm_group_memberships(
        participant_code, role, status,
        eckcm_people(
          first_name_en, last_name_en, display_name_ko,
          gender, birth_date, age_at_event, is_k12, grade,
          email, phone, phone_country,
          church_id, church_other, department_id,
          guardian_name, guardian_phone, guardian_phone_country
        )
      )
    `)
    .in("registration_id", regIds);

  if (!groups?.length) return [];

  // Load church and department names for lookup
  const [churchesRes, deptsRes] = await Promise.all([
    admin.from("eckcm_churches").select("id, name_en"),
    admin.from("eckcm_departments").select("id, name_en"),
  ]);
  const churchMap = new Map(
    (churchesRes.data ?? []).map((c: any) => [c.id, c.name_en])
  );
  const deptMap = new Map(
    (deptsRes.data ?? []).map((d: any) => [d.id, d.name_en])
  );

  const rows: ParticipantRow[] = [];
  for (const group of groups as any[]) {
    const confirmationCode = confirmationMap.get(group.registration_id) ?? "";
    for (const membership of group.eckcm_group_memberships ?? []) {
      const p = membership.eckcm_people;
      if (!p) continue;
      rows.push({
        participant_code: membership.participant_code ?? "",
        confirmation_code: confirmationCode,
        group_code: group.display_group_code ?? "",
        role: membership.role,
        membership_status: membership.status ?? "",
        first_name: p.first_name_en ?? "",
        last_name: p.last_name_en ?? "",
        korean_name: p.display_name_ko ?? "",
        gender: p.gender ?? "",
        birth_date: p.birth_date ?? "",
        age_at_event: p.age_at_event,
        is_k12: p.is_k12 ?? false,
        grade: p.grade ?? "",
        email: p.email ?? "",
        phone: p.phone ?? "",
        phone_country: p.phone_country ?? "",
        church: churchMap.get(p.church_id) ?? "",
        church_other: p.church_other ?? "",
        department: deptMap.get(p.department_id) ?? "",
        lodging_type: group.lodging_type ?? "",
        guardian_name: p.guardian_name ?? "",
        guardian_phone: p.guardian_phone ?? "",
        guardian_phone_country: p.guardian_phone_country ?? "",
      });
    }
  }
  return rows;
}

function participantToRow(p: ParticipantRow): (string | number | boolean)[] {
  return [
    p.participant_code,
    p.confirmation_code,
    p.group_code,
    p.role,
    p.membership_status,
    p.first_name,
    p.last_name,
    p.korean_name,
    p.gender,
    p.birth_date,
    p.age_at_event ?? "",
    p.is_k12 ? "Yes" : "No",
    p.grade,
    p.email,
    p.phone,
    p.phone_country,
    p.church,
    p.church_other,
    p.department,
    p.lodging_type,
    p.guardian_name,
    p.guardian_phone,
    p.guardian_phone_country,
  ];
}

interface MealRow {
  confirmation_code: string;
  first_name: string;
  last_name: string;
  date: string;
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
}

async function fetchMealData(eventId: string): Promise<MealRow[]> {
  const admin = createAdminClient();

  // Fetch checkin records of type DINING for the event, joined with person data
  const { data: checkins } = await admin
    .from("eckcm_checkins")
    .select(`
      person_id, checkin_type, checked_in_at,
      eckcm_sessions(name, session_date, start_time),
      eckcm_people!inner(first_name_en, last_name_en)
    `)
    .eq("event_id", eventId)
    .eq("checkin_type", "DINING");

  // Also get all participants for this event to build complete meal grid
  const participants = await fetchParticipants(eventId);

  // Get event dates to build the date range
  const { data: event } = await admin
    .from("eckcm_events")
    .select("event_start_date, event_end_date")
    .eq("id", eventId)
    .single();

  if (!event || !participants.length) return [];

  // Build date range (excluding start/end dates as those are arrival/departure)
  const start = new Date(event.event_start_date + "T00:00:00");
  const end = new Date(event.event_end_date + "T00:00:00");
  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().split("T")[0];
    if (iso !== event.event_start_date && iso !== event.event_end_date) {
      dates.push(iso);
    }
  }

  // Build dining check-in lookup: personId -> date -> Set<mealType>
  const diningMap = new Map<string, Map<string, Set<string>>>();
  for (const c of (checkins ?? []) as any[]) {
    const personId = c.person_id;
    const session = c.eckcm_sessions;
    if (!session) continue;
    const date = session.session_date;
    const mealName = (session.name ?? "").toUpperCase();

    let mealType = "";
    if (mealName.includes("BREAKFAST")) mealType = "BREAKFAST";
    else if (mealName.includes("LUNCH")) mealType = "LUNCH";
    else if (mealName.includes("DINNER")) mealType = "DINNER";

    if (!mealType) continue;

    if (!diningMap.has(personId)) diningMap.set(personId, new Map());
    const dateMap = diningMap.get(personId)!;
    if (!dateMap.has(date)) dateMap.set(date, new Set());
    dateMap.get(date)!.add(mealType);
  }

  // Build rows: one per participant per date
  const rows: MealRow[] = [];
  for (const p of participants) {
    for (const date of dates) {
      rows.push({
        confirmation_code: p.confirmation_code,
        first_name: p.first_name,
        last_name: p.last_name,
        date,
        breakfast: true, // Default: all meals selected during registration
        lunch: true,
        dinner: true,
      });
    }
  }
  return rows;
}

function mealToRow(m: MealRow): (string | number)[] {
  return [
    m.confirmation_code,
    m.first_name,
    m.last_name,
    m.date,
    m.breakfast ? "Yes" : "No",
    m.lunch ? "Yes" : "No",
    m.dinner ? "Yes" : "No",
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Full sync: fetch all registration data for the event and write to all 5 sheets.
 */
export async function syncAllToSheets(eventId: string): Promise<{
  registrations: number;
  participants: number;
  mealRows: number;
}> {
  if (!APPS_SCRIPT_URL) throw new Error("Google Sheets not configured");

  await ensureSheets();

  // Fetch all data in parallel
  const [registrations, participants, meals] = await Promise.all([
    fetchRegistrations(eventId),
    fetchParticipants(eventId),
    fetchMealData(eventId),
  ]);

  const regRows = registrations.map(registrationToRow);
  const participantRows = participants.map(participantToRow);
  const mealRows = meals.map(mealToRow);

  await callAppsScript("sync", {
    sheets: {
      [SHEET_NAMES.ORIGINAL]: regRows,
      [SHEET_NAMES.SYNC]: regRows,
      [SHEET_NAMES.COPY]: regRows,
      [SHEET_NAMES.PARTICIPANTS]: participantRows,
      [SHEET_NAMES.MEALS]: mealRows,
    },
  });

  return {
    registrations: registrations.length,
    participants: participants.length,
    mealRows: meals.length,
  };
}

/**
 * Incremental sync: append a single registration to Original + update Sync sheet.
 * Called after a new registration is submitted.
 */
export async function syncRegistration(
  eventId: string,
  registrationId: string
): Promise<void> {
  if (!APPS_SCRIPT_URL) return;

  try {
    await ensureSheets();

    const registrations = await fetchRegistrations(eventId);
    const allRegRows = registrations.map(registrationToRow);

    // Find the new registration row for append
    const admin = createAdminClient();
    const { data: newReg } = await admin
      .from("eckcm_registrations")
      .select("confirmation_code")
      .eq("id", registrationId)
      .single();

    let appendRow: (string | number)[] | null = null;
    if (newReg) {
      const found = registrations.find(
        (r) => r.confirmation_code === newReg.confirmation_code
      );
      if (found) appendRow = registrationToRow(found);
    }

    // Fetch participants and meals
    const [participants, meals] = await Promise.all([
      fetchParticipants(eventId),
      fetchMealData(eventId),
    ]);

    await callAppsScript("incrementalSync", {
      appendRow,
      appendSheets: [SHEET_NAMES.ORIGINAL, SHEET_NAMES.COPY],
      syncSheets: {
        [SHEET_NAMES.SYNC]: allRegRows,
        [SHEET_NAMES.PARTICIPANTS]: participants.map(participantToRow),
        [SHEET_NAMES.MEALS]: meals.map(mealToRow),
      },
    });
  } catch (err) {
    logger.error("[google-sheets] Incremental sync failed", {
      eventId,
      registrationId,
      error: String(err),
    });
  }
}

/**
 * Clear all data from all sheets (keep headers).
 * Called during Hard Reset.
 */
export async function clearAllSheets(): Promise<void> {
  if (!APPS_SCRIPT_URL) return;

  try {
    await callAppsScript("clear", {
      sheetNames: Object.values(SHEET_NAMES),
    });
  } catch (err) {
    logger.error("[google-sheets] Clear all sheets failed", {
      error: String(err),
    });
  }
}

/**
 * Get row counts for each sheet (for status display).
 */
export async function getSheetStatus(): Promise<
  Record<string, number> | null
> {
  if (!APPS_SCRIPT_URL) return null;

  try {
    const result = await callAppsScript("status", {
      sheetNames: Object.values(SHEET_NAMES),
    });
    return result.sheets ?? null;
  } catch (err) {
    logger.error("[google-sheets] Get status failed", {
      error: String(err),
    });
    return null;
  }
}
