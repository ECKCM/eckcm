"use client";

// Client-side Excel + PDF export for the Department View.
// Both exceljs and pdf-lib are heavy, so they're dynamically imported.

export interface ExportRow {
  name: string;
  nameKo: string | null;
  gender: string;
  birthDate: string;
  age: number | null;
  grade: number | null;
  church: string | null;
  groupCode: string;
  role: string;
  status: string;
  confirmationCode: string | null;
  participantCode: string | null;
  registrationStatus: string;
  checkin: string | null;
  checkout: string | null;
  nights: number | null;
  lodging: string | null;
  email: string | null;
  phone: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
}

interface ExportContext {
  rows: ExportRow[];
  departmentName: string;
  eventName: string;
  stats: { total: number; male: number; female: number; other: number };
  fileName: string;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─── Excel ─────────────────────────────────────────────────────────────── */

export async function exportDepartmentToExcel(ctx: ExportContext): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ECKCM";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(ctx.departmentName.slice(0, 31) || "Department");

  // Header block
  sheet.mergeCells("A1:M1");
  sheet.getCell("A1").value = `${ctx.departmentName} — Participants`;
  sheet.getCell("A1").font = { bold: true, size: 14 };

  sheet.mergeCells("A2:M2");
  sheet.getCell("A2").value = ctx.eventName;
  sheet.getCell("A2").font = { italic: true, color: { argb: "FF666666" } };

  sheet.mergeCells("A3:M3");
  sheet.getCell("A3").value =
    `Total: ${ctx.stats.total}   Male: ${ctx.stats.male}   Female: ${ctx.stats.female}   Other/N/A: ${ctx.stats.other}`;
  sheet.getCell("A3").font = { bold: true };

  sheet.addRow([]);

  // Column headers
  const columns = [
    { header: "Name (EN)", key: "name", width: 22 },
    { header: "이름", key: "nameKo", width: 14 },
    { header: "Gender", key: "gender", width: 10 },
    { header: "DOB", key: "birthDate", width: 12 },
    { header: "Age", key: "age", width: 6 },
    { header: "Grade", key: "grade", width: 8 },
    { header: "Church", key: "church", width: 24 },
    { header: "Group", key: "groupCode", width: 12 },
    { header: "Role", key: "role", width: 14 },
    { header: "Status", key: "status", width: 10 },
    { header: "Reg Code", key: "confirmationCode", width: 12 },
    { header: "P.Code", key: "participantCode", width: 10 },
    { header: "Reg Status", key: "registrationStatus", width: 12 },
    { header: "Check-in", key: "checkin", width: 12 },
    { header: "Check-out", key: "checkout", width: 12 },
    { header: "Nights", key: "nights", width: 8 },
    { header: "Lodging", key: "lodging", width: 14 },
    { header: "Email", key: "email", width: 28 },
    { header: "Phone", key: "phone", width: 16 },
    { header: "Guardian", key: "guardianName", width: 18 },
    { header: "Guardian Phone", key: "guardianPhone", width: 16 },
  ] as const;

  const headerRow = sheet.addRow(columns.map((c) => c.header));
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEFEFEF" },
  };
  headerRow.eachCell((cell) => {
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
    };
  });

  columns.forEach((col, idx) => {
    sheet.getColumn(idx + 1).width = col.width;
  });

  for (const r of ctx.rows) {
    sheet.addRow([
      r.name,
      r.nameKo ?? "",
      r.gender ?? "",
      r.birthDate ?? "",
      r.age ?? "",
      r.grade ?? "",
      r.church ?? "",
      r.groupCode,
      r.role,
      r.status,
      r.confirmationCode ?? "",
      r.participantCode ?? "",
      r.registrationStatus,
      r.checkin ?? "",
      r.checkout ?? "",
      r.nights ?? "",
      r.lodging ?? "",
      r.email ?? "",
      r.phone ?? "",
      r.guardianName ?? "",
      r.guardianPhone ?? "",
    ]);
  }

  const buf = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, ctx.fileName);
}

/* ─── PDF ───────────────────────────────────────────────────────────────── */

// Strip characters Helvetica (WinAnsi) cannot encode. Korean text will be
// dropped — same trade-off as the existing print/registrations PDF.
const safe = (text: string): string => text.replace(/[^\x00-\xFF]/g, "");

export async function exportDepartmentToPdf(ctx: ExportContext): Promise<void> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const PAGE_W = 842;
  const PAGE_H = 595; // landscape A4
  const MX = 32;
  const CW = PAGE_W - MX * 2;

  const C_HEAD_BG = rgb(0.059, 0.09, 0.165);
  const C_WHITE = rgb(1, 1, 1);
  const C_TEXT = rgb(0.067, 0.094, 0.153);
  const C_MUTED = rgb(0.42, 0.447, 0.502);
  const C_ROW_ALT = rgb(0.97, 0.97, 0.97);
  const C_BORDER = rgb(0.85, 0.85, 0.85);

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 32;

  const drawHeader = () => {
    page.drawRectangle({ x: MX, y: y - 50, width: CW, height: 50, color: C_HEAD_BG });
    page.drawText(safe(ctx.departmentName), {
      x: MX + 16,
      y: y - 22,
      size: 16,
      font: bold,
      color: C_WHITE,
    });
    page.drawText(safe(ctx.eventName), {
      x: MX + 16,
      y: y - 40,
      size: 9,
      font: regular,
      color: rgb(0.78, 0.82, 0.88),
    });

    const summary = `Total ${ctx.stats.total}   M ${ctx.stats.male}   F ${ctx.stats.female}   Other ${ctx.stats.other}`;
    const summaryW = bold.widthOfTextAtSize(summary, 11);
    page.drawText(summary, {
      x: MX + CW - summaryW - 16,
      y: y - 30,
      size: 11,
      font: bold,
      color: C_WHITE,
    });
    y -= 50 + 12;
  };

  const truncate = (text: string, maxWidth: number, size = 8): string => {
    const s = safe(text);
    if (regular.widthOfTextAtSize(s, size) <= maxWidth) return s;
    let t = s;
    while (t.length > 0 && regular.widthOfTextAtSize(t + "…", size) > maxWidth) {
      t = t.slice(0, -1);
    }
    return t + "…";
  };

  // Column widths sum should ≈ CW (778)
  const cols = [
    { label: "#", w: 24 },
    { label: "Name", w: 130 },
    { label: "Gender", w: 50 },
    { label: "Age", w: 32 },
    { label: "Grade", w: 38 },
    { label: "Church", w: 130 },
    { label: "Group", w: 70 },
    { label: "Role", w: 70 },
    { label: "Reg Code", w: 70 },
    { label: "Lodging", w: 70 },
    { label: "Phone", w: 90 },
    { label: "Guardian", w: 100 },
  ];

  const drawTableHeader = () => {
    page.drawRectangle({
      x: MX,
      y: y - 18,
      width: CW,
      height: 18,
      color: rgb(0.94, 0.94, 0.96),
    });
    let x = MX;
    for (const c of cols) {
      page.drawText(c.label, {
        x: x + 4,
        y: y - 12,
        size: 8,
        font: bold,
        color: C_MUTED,
      });
      x += c.w;
    }
    page.drawLine({
      start: { x: MX, y: y - 18 },
      end: { x: MX + CW, y: y - 18 },
      color: C_BORDER,
      thickness: 0.5,
    });
    y -= 18;
  };

  drawHeader();
  drawTableHeader();

  const ROW_H = 16;

  ctx.rows.forEach((r, i) => {
    if (y - ROW_H < 32) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - 32;
      drawHeader();
      drawTableHeader();
    }

    if (i % 2 === 1) {
      page.drawRectangle({
        x: MX,
        y: y - ROW_H,
        width: CW,
        height: ROW_H,
        color: C_ROW_ALT,
      });
    }

    const cells: string[] = [
      String(i + 1),
      r.name,
      r.gender ?? "-",
      r.age != null ? String(r.age) : "-",
      r.grade != null ? String(r.grade) : "-",
      r.church ?? "-",
      r.groupCode,
      r.role,
      r.confirmationCode ?? "-",
      r.lodging ?? "-",
      r.phone ?? "-",
      [r.guardianName, r.guardianPhone].filter(Boolean).join(" / ") || "-",
    ];

    let x = MX;
    cells.forEach((value, idx) => {
      page.drawText(truncate(value, cols[idx].w - 6), {
        x: x + 4,
        y: y - 11,
        size: 8,
        font: regular,
        color: C_TEXT,
      });
      x += cols[idx].w;
    });

    page.drawLine({
      start: { x: MX, y: y - ROW_H },
      end: { x: MX + CW, y: y - ROW_H },
      color: rgb(0.94, 0.94, 0.94),
      thickness: 0.3,
    });

    y -= ROW_H;
  });

  // Footer with page numbers
  const allPages = doc.getPages();
  allPages.forEach((p, idx) => {
    const footer = `Page ${idx + 1} of ${allPages.length} · Generated ${new Date().toLocaleDateString("en-US")}`;
    p.drawText(footer, {
      x: MX,
      y: 16,
      size: 8,
      font: regular,
      color: C_MUTED,
    });
  });

  const bytes = await doc.save();
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  downloadBlob(blob, ctx.fileName);
}
