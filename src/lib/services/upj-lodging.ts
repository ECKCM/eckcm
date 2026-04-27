import ExcelJS from "exceljs";
import path from "path";

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
      eventCapacity: eventCapacityForType(first.type, hostCap),
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
