import ExcelJS from "exceljs";
import path from "path";

export type CellKind = "room" | "label" | "section" | "empty";

export interface GridCell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  kind: CellKind;
  fillArgb?: string;
}

export interface FloorPlanGrid {
  building: string;
  sheetName: string;
  totalWidth: number;
  totalHeight: number;
  cells: GridCell[];
  stats: { label: string; value: string }[];
  sections: { row: number; y: number; label: string }[];
}

const COL_WIDTH_TO_PX = 7.5;
const ROW_HEIGHT_TO_PX = 1.333;
const DEFAULT_COL_WIDTH = 8.43;
const DEFAULT_ROW_HEIGHT = 15;

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object") {
    const v = value as { richText?: { text: string }[]; formula?: string; result?: unknown; text?: string };
    if (v.richText) return v.richText.map((r) => r.text).join("");
    if (v.formula) return v.result !== undefined ? String(v.result) : `=${v.formula}`;
    if (v.text) return v.text;
  }
  return "";
}

function classify(text: string): CellKind {
  if (!text || text.trim() === "") return "empty";
  const trimmed = text.trim();
  if (/^\d+$/.test(trimmed)) return "room";
  if (/floor/i.test(trimmed) && trimmed.length < 60) return "section";
  return "label";
}

export async function parseFloorPlan(filename: string, buildingName: string): Promise<FloorPlanGrid> {
  const filePath = path.join(process.cwd(), "public", "upj-lodging", filename);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = wb.worksheets[0];

  // Build column x positions
  const colCount = sheet.columnCount;
  const rowCount = sheet.rowCount;
  const colX: number[] = [0];
  for (let c = 1; c <= colCount; c++) {
    const col = sheet.getColumn(c);
    const w = (col.width ?? DEFAULT_COL_WIDTH) * COL_WIDTH_TO_PX;
    colX[c] = colX[c - 1] + w;
  }
  const rowY: number[] = [0];
  for (let r = 1; r <= rowCount; r++) {
    const row = sheet.getRow(r);
    const h = (row.height ?? DEFAULT_ROW_HEIGHT) * ROW_HEIGHT_TO_PX;
    rowY[r] = rowY[r - 1] + h;
  }

  // Parse merged cells
  const merges: Array<{ top: number; left: number; bottom: number; right: number }> = [];
  const mergeMap = new Map<string, { top: number; left: number; bottom: number; right: number }>();
  const sheetModel = sheet.model as { merges?: string[] } | undefined;
  if (sheetModel?.merges) {
    for (const m of sheetModel.merges) {
      const match = m.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      if (!match) continue;
      const top = parseInt(match[2], 10);
      const left = colLetterToNum(match[1]);
      const bottom = parseInt(match[4], 10);
      const right = colLetterToNum(match[3]);
      const region = { top, left, bottom, right };
      merges.push(region);
      for (let r = top; r <= bottom; r++) {
        for (let c = left; c <= right; c++) {
          if (r === top && c === left) continue;
          mergeMap.set(`${r}:${c}`, region);
        }
      }
    }
  }

  const cells: GridCell[] = [];
  const sections: { row: number; y: number; label: string }[] = [];
  const stats: { label: string; value: string }[] = [];
  const seen = new Set<string>();

  for (let r = 1; r <= rowCount; r++) {
    for (let c = 1; c <= colCount; c++) {
      const key = `${r}:${c}`;
      if (seen.has(key)) continue;
      if (mergeMap.has(key)) continue;
      const cell = sheet.getCell(r, c);
      const text = cellText(cell.value).trim();
      if (!text) continue;

      const merge = merges.find((m) => m.top === r && m.left === c);
      const top = r;
      const left = c;
      const bottom = merge ? merge.bottom : r;
      const right = merge ? merge.right : c;

      for (let rr = top; rr <= bottom; rr++) {
        for (let cc = left; cc <= right; cc++) {
          seen.add(`${rr}:${cc}`);
        }
      }

      const x = colX[left - 1];
      const y = rowY[top - 1];
      const width = colX[right] - x;
      const height = rowY[bottom] - y;
      const kind = classify(text);

      // Stats area: column A label + column B value, before "Floor" rows
      if (left === 1 && right === 1 && top <= 11 && top >= 4) {
        const valueCell = sheet.getCell(top, 2);
        const valueText = cellText(valueCell.value).trim();
        if (valueText && /total|doubles|singles|triples|beds|rooms|apartment/i.test(text)) {
          stats.push({ label: text.replace(/\s+/g, " "), value: valueText });
        }
      }

      if (kind === "section") {
        sections.push({ row: top, y, label: text });
      }

      const fillArgb =
        cell.fill && cell.fill.type === "pattern" && cell.fill.fgColor && cell.fill.fgColor.argb
          ? cell.fill.fgColor.argb
          : undefined;

      cells.push({
        row: top,
        col: left,
        rowSpan: bottom - top + 1,
        colSpan: right - left + 1,
        x,
        y,
        width,
        height,
        text,
        kind,
        fillArgb,
      });
    }
  }

  // Title from row 4 column A
  const titleCell = sheet.getCell(4, 1);
  const sheetName = cellText(titleCell.value).trim() || buildingName;

  return {
    building: buildingName,
    sheetName,
    totalWidth: colX[colCount],
    totalHeight: rowY[rowCount],
    cells,
    stats,
    sections,
  };
}

function colLetterToNum(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export async function getEmbeddedImages(filename: string): Promise<string[]> {
  const filePath = path.join(process.cwd(), "public", "upj-lodging", filename);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = wb.worksheets[0];
  const images = sheet.getImages();
  const result: string[] = [];
  for (const img of images) {
    const media = wb.getImage(Number(img.imageId));
    if (!media || !media.buffer) continue;
    const ext = media.extension || "png";
    const base64 = Buffer.from(media.buffer).toString("base64");
    result.push(`data:image/${ext};base64,${base64}`);
  }
  return result;
}
