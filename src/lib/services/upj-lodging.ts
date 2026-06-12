import ExcelJS from "exceljs";
import path from "path";
import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVE_REGISTRATION_STATUSES } from "@/lib/utils/constants";

// ─── Types ──────────────────────────────────────────────────────

/** A single row (slot) in the UPJ Excel file — one person UPJ tracks */
export interface ExcelSlot {
  fileIndex: number;   // 0-3 maps to BUILDING_FILES
  row: number;         // 1-based Excel row number (for export fill-in)
  roomNumber: string;
  building: string;
  type: string;
  note: string;
}

/** A room derived from grouping consecutive Excel slots */
export interface UPJRoom {
  roomNumber: string;
  building: string;
  buildingCode: string;     // LLC, WLW, MAP, OAK
  floor: number;            // derived from room number
  type: string;             // Double, Single, etc.
  hostCapacity: number;     // rows in Excel (people UPJ tracks)
  eventCapacity: number;    // max people for the event
  lodgingCategory: string;  // fee_category_code
  note: string;
  isAvailable: boolean;
  slots: ExcelSlot[];       // Excel row references for export
}

/** Participant info merged from DB assignment */
export interface AssignedParticipant {
  firstName: string;
  lastName: string;
  displayNameKo: string | null;
  arrival: string | null;   // YYYY-MM-DD
  departure: string | null; // YYYY-MM-DD
}

// ─── Constants ──────────────────────────────────────────────────

export const BUILDING_FILES = [
  { filename: "LLC-2026.xlsx", code: "LLC", building: "Living/Learning Center" },
  { filename: "Willow-2026.xlsx", code: "WLW", building: "Willow Hall" },
  { filename: "Maple-2026.xlsx", code: "MAP", building: "Maple Hall" },
  { filename: "Oak-2026.xlsx", code: "OAK", building: "Oak Hall" },
] as const;

/** Building code → default lodging fee category for import */
const DEFAULT_BUILDING_CATEGORY: Record<string, string> = {
  LLC: "LODGING_AC",
  WLW: "LODGING_WILLOW_EM",
  MAP: "LODGING_NON_AC",
  OAK: "LODGING_NON_AC",
};

/**
 * Willow Hall is assigned per-person and capped per room by the room's
 * `capacity` (the DB trigger trg_willow_room_capacity_guard reads it). Import
 * seeds every Willow room with this value so a re-import keeps the cap in sync.
 */
export const WILLOW_ROOM_CAPACITY = 3;

/**
 * Derive event capacity from room type.
 * Single: max 2 people for the event.
 * Double: max 6 people for the event.
 * Apartments: same as host capacity (conservative).
 */
function eventCapacityForType(type: string, hostCap: number): number {
  const t = type.toLowerCase();
  if (t === "double") return 6;
  if (t === "single") return 2;
  return hostCap; // apartments, etc.
}

/**
 * Derive floor number from room number.
 * e.g., "LLC-100" → 1, "LLC-253" → 2, "WLW-301A" → 3
 */
function floorFromRoomNumber(roomNumber: string): number {
  const match = roomNumber.match(/-(\d)/);
  return match ? parseInt(match[1], 10) : 0;
}

// ─── Excel Parsing ──────────────────────────────────────────────

const UPJ_DIR = path.join(process.cwd(), "public", "upj-lodging");

/**
 * Parse all 4 UPJ Excel files and return flat list of UPJ rooms.
 * Each room is derived from grouping consecutive rows with the same room number.
 */
export async function parseAllBuildings(): Promise<UPJRoom[]> {
  const results = await Promise.all(
    BUILDING_FILES.map((bf, fi) =>
      parseBuildingFile(path.join(UPJ_DIR, bf.filename), fi, bf.code, bf.building)
    )
  );
  return results.flat();
}

async function parseBuildingFile(
  filePath: string,
  fileIndex: number,
  buildingCode: string,
  buildingName: string,
): Promise<UPJRoom[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  // Collect all room slots
  const slots: ExcelSlot[] = [];

  ws.eachRow((row, rowNumber) => {
    // Column indices (1-based): A=1(First), B=2(Last), C=3(Arrival), D=4(Departure),
    // E=5(Building), F=6(Type), G=7(Room#), H=8(Note)
    const buildingVal = cellStr(row.getCell(5));
    const typeVal = cellStr(row.getCell(6));
    const roomVal = cellStr(row.getCell(7));

    // A valid room row has Building AND Room # filled
    if (!buildingVal || !roomVal) return;

    // Skip header rows (contain "Building" literally)
    if (buildingVal.toLowerCase() === "building") return;
    if (roomVal.toLowerCase().includes("room")) return;

    // Check for note in column 8
    const noteVal = cellStr(row.getCell(8));

    // Check if row is marked unavailable
    const firstNameVal = cellStr(row.getCell(1));
    const isNotAvailable =
      firstNameVal.toUpperCase().includes("NOT AVAILABLE") ||
      noteVal.toLowerCase().includes("not available");

    slots.push({
      fileIndex,
      row: rowNumber,
      roomNumber: roomVal.trim(),
      building: buildingVal.trim(),
      type: typeVal.trim() || "Double",
      note: isNotAvailable
        ? `NOT AVAILABLE${noteVal ? ` - ${noteVal}` : ""}`
        : noteVal,
    });
  });

  // Group slots by room number (consecutive rows with same room#)
  const roomMap = new Map<string, ExcelSlot[]>();
  for (const slot of slots) {
    const existing = roomMap.get(slot.roomNumber);
    if (existing) {
      existing.push(slot);
    } else {
      roomMap.set(slot.roomNumber, [slot]);
    }
  }

  // Build UPJRoom objects
  const rooms: UPJRoom[] = [];
  const defaultCategory = DEFAULT_BUILDING_CATEGORY[buildingCode] ?? "";

  for (const [roomNumber, roomSlots] of roomMap) {
    const first = roomSlots[0];
    const hostCap = roomSlots.length;
    const isAvailable = !roomSlots.some((s) => s.note.includes("NOT AVAILABLE"));

    rooms.push({
      roomNumber,
      building: buildingName,
      buildingCode,
      floor: floorFromRoomNumber(roomNumber),
      type: first.type,
      hostCapacity: hostCap,
      eventCapacity:
        buildingCode === "WLW"
          ? WILLOW_ROOM_CAPACITY
          : eventCapacityForType(first.type, hostCap),
      lodgingCategory: defaultCategory,
      note: mergeNotes(roomSlots),
      isAvailable,
      slots: roomSlots,
    });
  }

  // Sort by room number naturally
  rooms.sort((a, b) =>
    a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })
  );

  return rooms;
}

/** Merge unique notes from all slots of a room */
function mergeNotes(slots: ExcelSlot[]): string {
  const notes = new Set<string>();
  for (const s of slots) {
    const n = s.note.trim();
    if (n && n !== "NOT AVAILABLE") notes.add(n);
  }
  return Array.from(notes).join("; ");
}

/** Safely extract string from an ExcelJS cell */
function cellStr(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && "text" in v) return String(v.text);
  if (typeof v === "object" && "result" in v) return String(v.result ?? "");
  return String(v);
}

// ─── Excel Export ───────────────────────────────────────────────

/**
 * Generate an updated Excel file for a specific building.
 * Reads the original template and fills in assignment data.
 */
export async function exportBuildingExcel(
  fileIndex: number,
  assignments: Map<string, AssignedParticipant[]>,
): Promise<Buffer> {
  const bf = BUILDING_FILES[fileIndex];
  const filePath = path.join(UPJ_DIR, bf.filename);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`No worksheet found in ${bf.filename}`);

  // First pass: identify room rows and their room numbers
  const roomRows: { row: number; roomNumber: string }[] = [];
  ws.eachRow((row, rowNumber) => {
    const buildingVal = cellStr(row.getCell(5));
    const roomVal = cellStr(row.getCell(7));
    if (!buildingVal || !roomVal) return;
    if (buildingVal.toLowerCase() === "building") return;
    if (roomVal.toLowerCase().includes("room")) return;
    roomRows.push({ row: rowNumber, roomNumber: roomVal.trim() });
  });

  // Group rows by room number and fill in participants
  const roomSlotIndex = new Map<string, number>(); // tracks which slot we're filling

  for (const { row: rowNum, roomNumber } of roomRows) {
    const participants = assignments.get(roomNumber);
    if (!participants?.length) continue;

    const slotIdx = roomSlotIndex.get(roomNumber) ?? 0;
    if (slotIdx >= participants.length) continue;

    const p = participants[slotIdx];
    const row = ws.getRow(rowNum);

    // Only fill if this row doesn't already have "NOT AVAILABLE"
    const existing = cellStr(row.getCell(1));
    if (existing.toUpperCase().includes("NOT AVAILABLE")) continue;

    row.getCell(1).value = p.firstName;  // First Name
    row.getCell(2).value = p.lastName;   // Last Name
    if (p.arrival) row.getCell(3).value = formatDateForExcel(p.arrival);
    if (p.departure) row.getCell(4).value = formatDateForExcel(p.departure);

    // Force a visible, non-themed black font on every cell we write. Some of the
    // original templates (Maple/Oak/Willow) style empty cells with a theme font
    // (`Aptos Narrow`, scheme "minor") that several viewers — Numbers, Google
    // Sheets, macOS Preview — render as blank. Rebuilding the font without the
    // `scheme` reference and pinning an explicit color guarantees the names and
    // dates actually show up.
    for (const col of [1, 2, 3, 4]) {
      const cell = row.getCell(col);
      cell.font = {
        name: cell.font?.name ?? "Calibri",
        size: cell.font?.size ?? 11,
        color: { argb: "FF000000" },
      };
    }
    row.commit();

    roomSlotIndex.set(roomNumber, slotIdx + 1);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Format YYYY-MM-DD → MM/DD/YY for UPJ Excel */
function formatDateForExcel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

// ─── Occupancy (shared by Excel export + UPJ staff online table) ─

/** UPJ only tracks the representative + first member per room. */
export const UPJ_MAX_OCCUPANTS_PER_ROOM = 2;

/** Rank that sorts the REPRESENTATIVE membership ahead of plain members. */
function representativeRank(role: string | null | undefined): number {
  return role === "REPRESENTATIVE" ? 0 : 1;
}

/**
 * Build `room_number → occupants` for the whole event, capped at the two people
 * UPJ cares about: the registration representative followed by member 1. Both
 * occupants carry the registration's arrival/departure (so a room with >2 people
 * still shows the same stay dates on both rows). Willow Hall is per-person and,
 * by long-standing UPJ convention, contributes only its first assigned person.
 *
 * This is the single source of truth for both the Excel export and the
 * read-only online table — keep them consistent by going through here.
 */
export async function buildOccupancyByRoomNumber(
  supabase: SupabaseClient,
): Promise<Map<string, AssignedParticipant[]>> {
  const byRoom = new Map<string, AssignedParticipant[]>();

  // room id ↔ room number
  const { data: dbRooms } = await supabase
    .from("eckcm_rooms")
    .select("id, room_number");
  const numberByRoomId = new Map<string, string>();
  for (const r of (dbRooms ?? []) as { id: string; room_number: string }[]) {
    numberByRoomId.set(r.id, r.room_number);
  }

  // ── Group-based assignments (LLC / Maple / Oak) ──────────────
  // NOTE: deliberately no `.in("room_id", …)` filter — with the full room
  // inventory that builds a >16KB URL that Node's fetch rejects, silently
  // zeroing out assignments. Assignments are few, so fetch them all.
  // IMPORTANT: eckcm_group_memberships has NO `sort_order` column — selecting it
  // makes PostgREST reject the whole nested query, silently zeroing the export.
  // Order members the same way representative.ts does: by `created_at`.
  const { data: assignmentsRaw } = await supabase
    .from("eckcm_room_assignments")
    .select(`
      room_id,
      eckcm_groups!inner(
        eckcm_registrations!inner(start_date, end_date, status),
        eckcm_group_memberships(
          role, created_at,
          eckcm_people(first_name_en, last_name_en)
        )
      )
    `);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of (assignmentsRaw ?? []) as any[]) {
    const roomNumber = numberByRoomId.get(a.room_id);
    if (!roomNumber) continue;

    const group = a.eckcm_groups;
    if (!group) continue;

    const reg = Array.isArray(group.eckcm_registrations)
      ? group.eckcm_registrations[0]
      : group.eckcm_registrations;
    if (!reg || !ACTIVE_REGISTRATION_STATUSES.includes(reg.status)) continue;

    const memberships = (group.eckcm_group_memberships ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((m: any) => m.eckcm_people)
      // Representative first, then earliest-joined member (matches representative.ts).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((x: any, y: any) =>
        representativeRank(x.role) - representativeRank(y.role) ||
        String(x.created_at ?? "").localeCompare(String(y.created_at ?? "")));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const occupants: AssignedParticipant[] = memberships.map((m: any) => ({
      firstName: m.eckcm_people.first_name_en ?? "",
      lastName: m.eckcm_people.last_name_en ?? "",
      displayNameKo: null,
      arrival: reg.start_date ?? null,
      departure: reg.end_date ?? null,
    }));

    const existing = byRoom.get(roomNumber);
    if (existing) existing.push(...occupants);
    else byRoom.set(roomNumber, occupants);
  }

  // Cap each room at representative + member 1.
  for (const [roomNumber, list] of byRoom) {
    if (list.length > UPJ_MAX_OCCUPANTS_PER_ROOM) {
      byRoom.set(roomNumber, list.slice(0, UPJ_MAX_OCCUPANTS_PER_ROOM));
    }
  }

  // ── Willow Hall: per-person, first assigned person only ──────
  const { data: willowRaw } = await supabase
    .from("eckcm_willow_assignments")
    .select(`
      room_id, assigned_at,
      eckcm_group_memberships!inner(
        stay_start_date, stay_end_date,
        eckcm_people!inner(first_name_en, last_name_en),
        eckcm_groups!inner(
          eckcm_registrations!inner(start_date, end_date, status)
        )
      )
    `)
    .order("assigned_at", { ascending: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const w of (willowRaw ?? []) as any[]) {
    const roomNumber = numberByRoomId.get(w.room_id);
    if (!roomNumber) continue;
    // Rows are earliest-first; keep only the first person per Willow room.
    if (byRoom.has(roomNumber)) continue;

    const m = w.eckcm_group_memberships;
    const person = m?.eckcm_people;
    if (!person) continue;
    const reg = Array.isArray(m.eckcm_groups?.eckcm_registrations)
      ? m.eckcm_groups.eckcm_registrations[0]
      : m.eckcm_groups?.eckcm_registrations;
    if (!reg || !ACTIVE_REGISTRATION_STATUSES.includes(reg.status)) continue;

    byRoom.set(roomNumber, [
      {
        firstName: person.first_name_en ?? "",
        lastName: person.last_name_en ?? "",
        displayNameKo: null,
        arrival: m.stay_start_date ?? reg.start_date ?? null,
        departure: m.stay_end_date ?? reg.end_date ?? null,
      },
    ]);
  }

  return byRoom;
}

// ─── UPJ staff capability link ───────────────────────────────────
//
// The online table is shared with off-site UPJ staff who have no admin login,
// so it lives behind an unguessable capability URL — the same model as e-pass.
// The token is derived (not stored) from the existing `epass_hmac_secret`, so
// there's nothing new to provision: rotating that secret rotates this link too.

/**
 * Derive the UPJ staff link token from a server secret. Returns null when no
 * secret is configured (feature simply stays disabled rather than exposing a
 * guessable link).
 */
export function deriveUpjToken(secret: string | null | undefined): string | null {
  const s = secret || process.env.UPJ_LODGING_SECRET || null;
  if (!s) return null;
  return createHmac("sha256", s).update("upj-lodging-v1").digest("hex").slice(0, 40);
}

/** Constant-time comparison of a candidate token against the derived one. */
export function upjTokenMatches(
  candidate: string,
  secret: string | null | undefined,
): boolean {
  const expected = deriveUpjToken(secret);
  if (!expected || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
