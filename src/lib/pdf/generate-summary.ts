import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";

/* ─── Data Interfaces ──────────────────────────────────────────────────────── */

export interface SummaryParticipant {
  name: string;
  nameKo: string | null;
  gender: string;
  age: number | null;
  isK12: boolean;
  grade: string | null;
  email: string | null;
  phone: string | null;
  church: string | null;
  department: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  groupCode: string;
  role: string;
}

export interface RegistrationSummaryPdfData {
  confirmationCode: string;
  eventName: string;
  startDate: string;
  endDate: string;
  nightsCount: number;
  status: string;
  registrantName: string;
  registrantEmail: string;
  registrationType: string;
  totalAmount: string;
  participants: SummaryParticipant[];
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
    amount: string;
  }>;
  subtotal: string;
  total: string;
}

/* ─── PDF Settings (shared cache with generate.ts) ─────────────────────────── */

interface PdfSettings {
  orgName: string;
  orgSubtitle: string;
  footerText: string;
}

let cachedSettings: PdfSettings | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

async function getPdfSettings(): Promise<PdfSettings> {
  const now = Date.now();
  if (cachedSettings && now - cacheTime < CACHE_TTL) return cachedSettings;

  const defaults: PdfSettings = {
    orgName: "ECKCM",
    orgSubtitle: "East Coast Korean Camp Meeting",
    footerText: "East Coast Korean Camp Meeting · eckcm.com",
  };
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("eckcm_app_config")
      .select("pdf_settings")
      .eq("id", 1)
      .single();
    const s = data?.pdf_settings as Partial<PdfSettings> | null;
    cachedSettings = { ...defaults, ...s };
  } catch {
    cachedSettings = defaults;
  }
  cacheTime = now;
  return cachedSettings;
}

/* ─── Constants ────────────────────────────────────────────────────────────── */

const PAGE_W = 595;
const PAGE_H = 842;
const MX = 48;
const CW = PAGE_W - MX * 2; // 499
const FOOTER_ZONE = 60; // reserved for footer
const TOP_MARGIN = 40;

// Colors
const C_DARK = rgb(0.059, 0.09, 0.165);
const C_WHITE = rgb(1, 1, 1);
const C_BLACK = rgb(0.067, 0.094, 0.153);
const C_GRAY_MID = rgb(0.42, 0.447, 0.502);
const C_GRAY_LIGHT = rgb(0.58, 0.639, 0.722);
const C_BORDER = rgb(0.898, 0.91, 0.922);
const C_ROW_ALT = rgb(0.976, 0.98, 0.984);
const C_ROW_SEP = rgb(0.953, 0.957, 0.965);
const C_FOOTER = rgb(0.612, 0.639, 0.675);
const C_SECTION_BG = rgb(0.945, 0.949, 0.957);

/* ─── Generator ────────────────────────────────────────────────────────────── */

export async function generateRegistrationSummaryPdf(
  data: RegistrationSummaryPdfData
): Promise<Buffer> {
  const pdfSettings = await getPdfSettings();
  const doc = await PDFDocument.create();
  const [regular, bold] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
  ]);

  // State for multi-page support
  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - TOP_MARGIN;

  // ─── Helpers ────────────────────────────────────────────────────────────

  /** Strip characters that WinAnsi (Helvetica) can't encode (> U+00FF) */
  const safe = (text: string): string =>
    text.replace(/[^\x00-\xFF]/g, "");

  const txt = (
    text: string,
    x: number,
    yPos: number,
    font: PDFFont,
    size: number,
    color: ReturnType<typeof rgb>,
    p?: PDFPage
  ) => (p ?? page).drawText(safe(String(text)), { x, y: yPos, font, size, color });

  const truncate = (text: string, font: PDFFont, size: number, maxWidth: number): string => {
    const s = safe(text);
    if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;
    let t = s;
    while (t.length > 0 && font.widthOfTextAtSize(t + "...", size) > maxWidth) {
      t = t.slice(0, -1);
    }
    return t + "...";
  };

  /** Ensure enough space; if not, add a new page and return new y */
  const ensureSpace = (needed: number): number => {
    if (y - needed < FOOTER_ZONE) {
      drawFooter(page, pdfSettings, regular);
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - TOP_MARGIN;
    }
    return y;
  };

  const drawFooter = (p: PDFPage, settings: PdfSettings, font: PDFFont) => {
    const fy = 40;
    p.drawLine({ start: { x: MX, y: fy + 20 }, end: { x: MX + CW, y: fy + 20 }, color: C_BORDER, thickness: 0.5 });
    txt(settings.footerText, MX, fy + 8, font, 9, C_FOOTER, p);
    const genText = `${data.confirmationCode} · Generated ${new Date().toLocaleDateString("en-US")}`;
    txt(genText, MX + CW - font.widthOfTextAtSize(genText, 9), fy + 8, font, 9, C_FOOTER, p);
  };

  // ─── HEADER BANNER ──────────────────────────────────────────────────────
  const HEADER_H = 52;
  page.drawRectangle({ x: MX, y: y - HEADER_H, width: CW, height: HEADER_H, color: C_DARK });

  txt(pdfSettings.orgName, MX + 24, y - 23, bold, 20, C_WHITE);
  txt(pdfSettings.orgSubtitle, MX + 24, y - 39, regular, 9, C_GRAY_LIGHT);

  const docLabel = "Registration Summary";
  const rightEdge = MX + CW - 24;
  txt(docLabel, rightEdge - bold.widthOfTextAtSize(docLabel, 13), y - 32, bold, 13, C_WHITE);
  y -= HEADER_H + 16;

  // ─── STATUS BADGE ───────────────────────────────────────────────────────
  const statusLabel = data.status;
  const BADGE_PAD_X = 10;
  const BADGE_H = 18;
  const badgeTextW = bold.widthOfTextAtSize(statusLabel, 10);
  const badgeW = badgeTextW + BADGE_PAD_X * 2;

  const isPaid = data.status === "PAID";
  const badgeBg = isPaid ? rgb(0.941, 0.996, 0.957) : rgb(0.996, 0.988, 0.91);
  const badgeTextColor = isPaid ? rgb(0.086, 0.396, 0.204) : rgb(0.573, 0.251, 0.055);
  const badgeBorderColor = isPaid ? rgb(0.733, 0.969, 0.816) : rgb(0.992, 0.902, 0.541);

  page.drawRectangle({
    x: MX, y: y - BADGE_H, width: badgeW, height: BADGE_H,
    color: badgeBg, borderColor: badgeBorderColor, borderWidth: 0.5,
  });
  txt(statusLabel, MX + BADGE_PAD_X, y - BADGE_H + 5, bold, 10, badgeTextColor);
  y -= BADGE_H + 16;

  // ─── REGISTRATION INFO ──────────────────────────────────────────────────
  const ROW_H = 20;
  const infoRows: [string, string][] = [
    ["Confirmation Code", data.confirmationCode],
    ["Event", truncate(data.eventName, bold, 10, CW * 0.65)],
    ["Dates", `${data.startDate} ~ ${data.endDate}`],
    ["Nights", String(data.nightsCount)],
    ["Registrant", truncate(data.registrantName, bold, 10, CW * 0.65)],
    ["Email", truncate(data.registrantEmail, bold, 10, CW * 0.65)],
    ["Type", data.registrationType === "others" ? "Others" : "Self"],
    ["Total Amount", data.totalAmount],
  ];

  for (const [label, value] of infoRows) {
    txt(label, MX, y - 14, regular, 10, C_GRAY_MID);
    txt(value, MX + CW - bold.widthOfTextAtSize(value, 10), y - 14, bold, 10, C_BLACK);
    page.drawLine({
      start: { x: MX, y: y - ROW_H },
      end: { x: MX + CW, y: y - ROW_H },
      color: C_ROW_SEP, thickness: 0.5,
    });
    y -= ROW_H;
  }
  y -= 20;

  // ─── PARTICIPANTS SECTION ───────────────────────────────────────────────
  y = ensureSpace(60);

  // Section header
  const SECTION_H = 24;
  page.drawRectangle({ x: MX, y: y - SECTION_H, width: CW, height: SECTION_H, color: C_SECTION_BG });
  const participantsTitle = `PARTICIPANTS (${data.participants.length})`;
  txt(participantsTitle, MX + 10, y - SECTION_H + 8, bold, 10, C_BLACK);
  y -= SECTION_H + 8;

  // Table header (Korean name omitted — Helvetica can't render CJK glyphs)
  const PT_COLS = {
    num: 25,
    name: 180,
    gender: 45,
    age: 45,
    church: 105,
    dept: CW - 25 - 180 - 45 - 45 - 105, // ~99
  };
  const PT_ROW_H = 18;

  y = ensureSpace(PT_ROW_H + 2);
  const headerY = y;

  let colX = MX;
  const ptHeaders: [string, number, number][] = [
    ["#", PT_COLS.num, colX],
    ["Name", PT_COLS.name, colX += PT_COLS.num],
    ["Gender", PT_COLS.gender, colX += PT_COLS.name],
    ["Age", PT_COLS.age, colX += PT_COLS.gender],
    ["Church", PT_COLS.church, colX += PT_COLS.age],
    ["Department", PT_COLS.dept, colX += PT_COLS.church],
  ];

  for (const [label, , x] of ptHeaders) {
    txt(label, x + 4, headerY - 13, bold, 8, C_GRAY_MID);
  }
  page.drawLine({
    start: { x: MX, y: headerY - PT_ROW_H },
    end: { x: MX + CW, y: headerY - PT_ROW_H },
    color: C_BORDER, thickness: 0.5,
  });
  y -= PT_ROW_H;

  // Participant rows
  for (let i = 0; i < data.participants.length; i++) {
    const p = data.participants[i];
    // Each participant needs: main row + optional detail row (email/phone/guardian)
    const hasDetails = p.email || p.phone || p.guardianName;
    const neededH = PT_ROW_H + (hasDetails ? 14 : 0) + 2;
    y = ensureSpace(neededH);

    const rowY = y;

    // Alternate row background
    if (i % 2 === 1) {
      page.drawRectangle({
        x: MX, y: rowY - neededH, width: CW, height: neededH, color: C_ROW_ALT,
      });
    }

    // Main row
    colX = MX;
    const textY = rowY - 13;

    // #
    txt(String(i + 1), colX + 4, textY, regular, 9, C_BLACK);
    colX += PT_COLS.num;

    // Name
    const nameText = `${p.name}`;
    const roleTag = p.role === "REPRESENTATIVE" ? " [R]" : "";
    txt(truncate(nameText + roleTag, regular, 9, PT_COLS.name - 8), colX + 4, textY, regular, 9, C_BLACK);
    colX += PT_COLS.name;

    // Gender
    txt(p.gender || "-", colX + 4, textY, regular, 9, C_BLACK);
    colX += PT_COLS.gender;

    // Age
    const ageStr = p.age != null ? String(p.age) : "-";
    const k12Tag = p.isK12 ? (p.grade ? ` (${p.grade})` : " K12") : "";
    txt(ageStr + k12Tag, colX + 4, textY, regular, 9, C_BLACK);
    colX += PT_COLS.age;

    // Church
    txt(truncate(p.church ?? "-", regular, 8, PT_COLS.church - 8), colX + 4, textY, regular, 8, C_BLACK);
    colX += PT_COLS.church;

    // Department
    txt(truncate(p.department ?? "-", regular, 8, PT_COLS.dept - 8), colX + 4, textY, regular, 8, C_BLACK);

    y -= PT_ROW_H;

    // Detail row (email, phone, guardian)
    if (hasDetails) {
      const details: string[] = [];
      if (p.email) details.push(p.email);
      if (p.phone) details.push(p.phone);
      if (p.guardianName) {
        details.push(`Guardian: ${p.guardianName}${p.guardianPhone ? ` (${p.guardianPhone})` : ""}`);
      }
      const detailText = truncate(details.join("  |  "), regular, 7, CW - PT_COLS.num - 16);
      txt(detailText, MX + PT_COLS.num + 4, y - 10, regular, 7, C_GRAY_MID);
      y -= 14;
    }

    y -= 2;

    // Row separator
    page.drawLine({
      start: { x: MX, y: y },
      end: { x: MX + CW, y: y },
      color: C_ROW_SEP, thickness: 0.3,
    });
  }

  y -= 20;

  // ─── PRICING SECTION ────────────────────────────────────────────────────
  if (data.lineItems.length > 0) {
    y = ensureSpace(60);

    // Section header
    page.drawRectangle({ x: MX, y: y - SECTION_H, width: CW, height: SECTION_H, color: C_SECTION_BG });
    txt("PRICING BREAKDOWN", MX + 10, y - SECTION_H + 8, bold, 10, C_BLACK);
    y -= SECTION_H + 8;

    // Table columns: Description 59%, Qty 10%, Unit 15.5%, Amount 15.5%
    const COL_DESC = CW * 0.59;
    const COL_QTY = CW * 0.10;
    const COL_UNIT = CW * 0.155;
    const COL_AMT = CW * 0.155;
    const X_DESC = MX;
    const X_QTY = X_DESC + COL_DESC;
    const X_UNIT = X_QTY + COL_QTY;
    const X_AMT = X_UNIT + COL_UNIT;
    const TABLE_HDR_H = 22;
    const TABLE_ROW_H = 20;

    const tableH = TABLE_HDR_H + TABLE_ROW_H * data.lineItems.length;
    y = ensureSpace(tableH + 60);

    // Table border
    page.drawRectangle({
      x: MX, y: y - tableH, width: CW, height: tableH,
      color: C_WHITE, borderColor: C_BORDER, borderWidth: 0.5,
    });
    // Header background
    page.drawRectangle({
      x: MX, y: y - TABLE_HDR_H, width: CW, height: TABLE_HDR_H, color: C_ROW_ALT,
    });

    // Header labels
    const hdrs: [string, number, "left" | "center" | "right", number][] = [
      ["DESCRIPTION", X_DESC + 10, "left", COL_DESC - 10],
      ["QTY", X_QTY, "center", COL_QTY],
      ["UNIT PRICE", X_UNIT, "right", COL_UNIT - 10],
      ["AMOUNT", X_AMT, "right", COL_AMT - 10],
    ];
    for (const [label, startX, align, colW] of hdrs) {
      const w = bold.widthOfTextAtSize(label, 8);
      const x = align === "left" ? startX : align === "center" ? startX + (colW - w) / 2 : startX + colW - w;
      txt(label, x, y - TABLE_HDR_H + 8, bold, 8, C_GRAY_MID);
    }

    page.drawLine({
      start: { x: MX, y: y - TABLE_HDR_H },
      end: { x: MX + CW, y: y - TABLE_HDR_H },
      color: C_BORDER, thickness: 0.5,
    });
    y -= TABLE_HDR_H;

    // Rows
    for (const item of data.lineItems) {
      const textY = y - TABLE_ROW_H + 6;

      txt(truncate(item.description, regular, 10, COL_DESC - 20), X_DESC + 10, textY, regular, 10, C_BLACK);

      const qtyStr = String(item.quantity);
      txt(qtyStr, X_QTY + (COL_QTY - regular.widthOfTextAtSize(qtyStr, 10)) / 2, textY, regular, 10, C_BLACK);

      txt(item.unitPrice, X_UNIT + COL_UNIT - regular.widthOfTextAtSize(item.unitPrice, 10) - 10, textY, regular, 10, C_BLACK);

      txt(item.amount, X_AMT + COL_AMT - regular.widthOfTextAtSize(item.amount, 10) - 10, textY, regular, 10, C_BLACK);

      page.drawLine({
        start: { x: MX, y: y - TABLE_ROW_H },
        end: { x: MX + CW, y: y - TABLE_ROW_H },
        color: C_ROW_SEP, thickness: 0.3,
      });
      y -= TABLE_ROW_H;
    }

    y -= 12;

    // Totals
    y = ensureSpace(50);
    const TOT_START_X = MX + CW * 0.6;

    txt("Subtotal", TOT_START_X, y - 14, regular, 10, C_GRAY_MID);
    txt(data.subtotal, MX + CW - regular.widthOfTextAtSize(data.subtotal, 10), y - 14, regular, 10, C_BLACK);
    y -= 20;

    page.drawLine({
      start: { x: TOT_START_X, y: y + 4 },
      end: { x: MX + CW, y: y + 4 },
      color: C_BLACK, thickness: 1.5,
    });
    txt("Total", TOT_START_X, y - 14, bold, 11, C_BLACK);
    txt(data.total, MX + CW - bold.widthOfTextAtSize(data.total, 11), y - 14, bold, 11, C_BLACK);
  }

  // ─── FOOTER (on all pages) ──────────────────────────────────────────────
  const pages = doc.getPages();
  for (const p of pages) {
    drawFooter(p, pdfSettings, regular);
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
