import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";

export interface InvoicePdfData {
  invoiceNumber: string;
  confirmationCode: string;
  eventName: string;
  issuedDate: string;
  isPaid: boolean;
  paymentMethod: string;
  paymentDate: string;
  billTo: string;        // representative user email
  dateDue?: string;      // event end date (for invoices)
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
    amount: string;
  }>;
  subtotal: string;
  total: string;
}

interface PdfSettings {
  orgName: string;
  orgSubtitle: string;
  footerText: string;
}

let cachedPdfSettings: PdfSettings | null = null;
let pdfSettingsCacheTime = 0;
const PDF_CACHE_TTL = 60_000;

async function getPdfSettings(): Promise<PdfSettings> {
  const now = Date.now();
  if (cachedPdfSettings && now - pdfSettingsCacheTime < PDF_CACHE_TTL) {
    return cachedPdfSettings;
  }
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
    const settings = data?.pdf_settings as Partial<PdfSettings> | null;
    cachedPdfSettings = { ...defaults, ...settings };
  } catch {
    cachedPdfSettings = defaults;
  }
  pdfSettingsCacheTime = now;
  return cachedPdfSettings;
}

const PAGE_W = 595;
const PAGE_H = 842;
const MX = 48; // horizontal margin
const CW = PAGE_W - MX * 2; // content width = 499

// Colors (rgb values 0–1)
const C_DARK = rgb(0.059, 0.09, 0.165); // #0f172a
const C_WHITE = rgb(1, 1, 1);
const C_BLACK = rgb(0.067, 0.094, 0.153); // #111827
const C_GRAY_MID = rgb(0.42, 0.447, 0.502); // #6b7280
const C_GRAY_LIGHT = rgb(0.58, 0.639, 0.722); // #94a3b8
const C_BORDER = rgb(0.898, 0.91, 0.922); // #e5e7eb
const C_ROW_ALT = rgb(0.976, 0.98, 0.984); // #f9fafb
const C_ROW_SEP = rgb(0.953, 0.957, 0.965); // #f3f4f6
const C_FOOTER = rgb(0.612, 0.639, 0.675); // #9ca3af

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const {
    invoiceNumber,
    confirmationCode,
    eventName,
    issuedDate,
    isPaid,
    paymentMethod,
    paymentDate,
    billTo,
    dateDue,
    lineItems,
    subtotal,
    total,
  } = data;

  // Derive receipt number from invoice number: INV-YYYY-NNNN → RCT-YYYY-NNNN
  const receiptNumber = invoiceNumber.replace(/^INV-/, "RCT-");

  const pdfSettings = await getPdfSettings();

  const doc = await PDFDocument.create();
  const [regular, bold] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
  ]);

  const page = doc.addPage([PAGE_W, PAGE_H]);
  const docTitle = isPaid ? "Receipt" : "Invoice";

  // Helper: draw text
  const txt = (
    text: string,
    x: number,
    y: number,
    font: typeof regular,
    size: number,
    color: ReturnType<typeof rgb>
  ) => page.drawText(String(text), { x, y, font, size, color });

  // Truncate text to fit within maxWidth
  const truncate = (text: string, font: typeof regular, size: number, maxWidth: number): string => {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
    let t = text;
    while (t.length > 0 && font.widthOfTextAtSize(t + "…", size) > maxWidth) {
      t = t.slice(0, -1);
    }
    return t + "…";
  };

  let y = PAGE_H - 40;

  // ─── HEADER ──────────────────────────────────────────────────────────────────
  const HEADER_H = 52;
  page.drawRectangle({ x: MX, y: y - HEADER_H, width: CW, height: HEADER_H, color: C_DARK });

  // Left: org name + subtitle
  txt(pdfSettings.orgName, MX + 24, y - 23, bold, 20, C_WHITE);
  txt(pdfSettings.orgSubtitle, MX + 24, y - 39, regular, 9, C_GRAY_LIGHT);

  // Right: doc type label + number (right-aligned)
  const headerNumber = isPaid ? receiptNumber : invoiceNumber;
  const docLabel = `${docTitle} #`;
  const rightEdge = MX + CW - 24;
  txt(docLabel, rightEdge - regular.widthOfTextAtSize(docLabel, 9), y - 23, regular, 9, C_GRAY_LIGHT);
  txt(headerNumber, rightEdge - bold.widthOfTextAtSize(headerNumber, 13), y - 39, bold, 13, C_WHITE);

  y -= HEADER_H + 16;

  // ─── STATUS BADGE ─────────────────────────────────────────────────────────
  const badgeLabel = isPaid ? "PAID" : "PENDING PAYMENT";
  const BADGE_PAD_X = 10;
  const BADGE_H = 18;
  const badgeTextW = bold.widthOfTextAtSize(badgeLabel, 10);
  const badgeW = badgeTextW + BADGE_PAD_X * 2;
  const badgeBg = isPaid ? rgb(0.941, 0.996, 0.957) : rgb(0.996, 0.988, 0.91);
  const badgeTextColor = isPaid ? rgb(0.086, 0.396, 0.204) : rgb(0.573, 0.251, 0.055);
  const badgeBorderColor = isPaid ? rgb(0.733, 0.969, 0.816) : rgb(0.992, 0.902, 0.541);

  page.drawRectangle({
    x: MX, y: y - BADGE_H, width: badgeW, height: BADGE_H,
    color: badgeBg, borderColor: badgeBorderColor, borderWidth: 0.5,
  });
  txt(badgeLabel, MX + BADGE_PAD_X, y - BADGE_H + 5, bold, 10, badgeTextColor);

  y -= BADGE_H + 16;

  // ─── INFO ROWS ────────────────────────────────────────────────────────────
  const ROW_H = 20;
  const infoRows: [string, string][] = isPaid
    ? [
        // Receipt: Invoice #, Receipt #, Date Paid, Bill To, Event, Code
        ["Invoice Number", invoiceNumber],
        ["Receipt Number", receiptNumber],
        ...(paymentDate !== "-" ? ([["Date Paid", paymentDate]] as [string, string][]) : []),
        ["Bill To", truncate(billTo, bold, 10, CW * 0.65)],
        ["Event", truncate(eventName, bold, 10, CW * 0.65)],
        ["Confirmation Code", confirmationCode],
        ["Payment Method", paymentMethod],
      ]
    : [
        // Invoice: Invoice #, Date of Issue, Date Due, Bill To, Event, Code
        ["Invoice Number", invoiceNumber],
        ["Date of Issue", issuedDate],
        ...(dateDue ? ([["Date Due", dateDue]] as [string, string][]) : []),
        ["Bill To", truncate(billTo, bold, 10, CW * 0.65)],
        ["Event", truncate(eventName, bold, 10, CW * 0.65)],
        ["Confirmation Code", confirmationCode],
      ];

  for (const [label, value] of infoRows) {
    txt(label, MX, y - 14, regular, 10, C_GRAY_MID);
    txt(value, MX + CW - bold.widthOfTextAtSize(value, 10), y - 14, bold, 10, C_BLACK);
    page.drawLine({ start: { x: MX, y: y - ROW_H }, end: { x: MX + CW, y: y - ROW_H }, color: C_ROW_SEP, thickness: 0.5 });
    y -= ROW_H;
  }

  y -= 16;

  // ─── LINE ITEMS TABLE ─────────────────────────────────────────────────────
  // Column widths: Description 59%, Qty 10%, Unit 15.5%, Amount 15.5%
  const COL_DESC = CW * 0.59; // ~294
  const COL_QTY  = CW * 0.10; // ~50
  const COL_UNIT = CW * 0.155; // ~77
  const COL_AMT  = CW * 0.155; // ~77

  const X_DESC = MX;
  const X_QTY  = X_DESC + COL_DESC;
  const X_UNIT = X_QTY  + COL_QTY;
  const X_AMT  = X_UNIT + COL_UNIT;

  const TABLE_HDR_H = 22;
  const TABLE_ROW_H = 20;
  const tableH = TABLE_HDR_H + TABLE_ROW_H * lineItems.length;

  // Table border
  page.drawRectangle({ x: MX, y: y - tableH, width: CW, height: tableH, color: C_WHITE, borderColor: C_BORDER, borderWidth: 0.5 });
  // Header background
  page.drawRectangle({ x: MX, y: y - TABLE_HDR_H, width: CW, height: TABLE_HDR_H, color: C_ROW_ALT });

  // Header labels
  const hdrs: [string, number, "left" | "center" | "right", number][] = [
    ["DESCRIPTION", X_DESC + 10, "left",   COL_DESC - 10],
    ["QTY",         X_QTY,       "center", COL_QTY],
    ["UNIT PRICE",  X_UNIT,      "right",  COL_UNIT - 10],
    ["AMOUNT",      X_AMT,       "right",  COL_AMT - 10],
  ];
  for (const [label, startX, align, colW] of hdrs) {
    const w = bold.widthOfTextAtSize(label, 8);
    const x = align === "left" ? startX : align === "center" ? startX + (colW - w) / 2 : startX + colW - w;
    txt(label, x, y - TABLE_HDR_H + 8, bold, 8, C_GRAY_MID);
  }

  // Header separator
  page.drawLine({ start: { x: MX, y: y - TABLE_HDR_H }, end: { x: MX + CW, y: y - TABLE_HDR_H }, color: C_BORDER, thickness: 0.5 });
  y -= TABLE_HDR_H;

  // Rows
  for (const item of lineItems) {
    const rowY = y - TABLE_ROW_H;
    const textY = rowY + 6;

    // Description (left, truncated)
    txt(truncate(item.description, regular, 10, COL_DESC - 20), X_DESC + 10, textY, regular, 10, C_BLACK);

    // Qty (centered)
    const qtyStr = String(item.quantity);
    txt(qtyStr, X_QTY + (COL_QTY - regular.widthOfTextAtSize(qtyStr, 10)) / 2, textY, regular, 10, C_BLACK);

    // Unit price (right)
    txt(item.unitPrice, X_UNIT + COL_UNIT - regular.widthOfTextAtSize(item.unitPrice, 10) - 10, textY, regular, 10, C_BLACK);

    // Amount (right)
    txt(item.amount, X_AMT + COL_AMT - regular.widthOfTextAtSize(item.amount, 10) - 10, textY, regular, 10, C_BLACK);

    // Row separator
    page.drawLine({ start: { x: MX, y: rowY }, end: { x: MX + CW, y: rowY }, color: C_ROW_SEP, thickness: 0.3 });
    y -= TABLE_ROW_H;
  }

  y -= 12;

  // ─── TOTALS ───────────────────────────────────────────────────────────────
  const TOT_START_X = MX + CW * 0.6; // right 40% of content

  // Subtotal
  txt("Subtotal", TOT_START_X, y - 14, regular, 10, C_GRAY_MID);
  txt(subtotal, MX + CW - regular.widthOfTextAtSize(subtotal, 10), y - 14, regular, 10, C_BLACK);
  y -= 20;

  // Total (bold, with separator line above)
  page.drawLine({ start: { x: TOT_START_X, y: y + 4 }, end: { x: MX + CW, y: y + 4 }, color: C_BLACK, thickness: 1.5 });
  txt("Total", TOT_START_X, y - 14, bold, 11, C_BLACK);
  txt(total, MX + CW - bold.widthOfTextAtSize(total, 11), y - 14, bold, 11, C_BLACK);

  // ─── FOOTER ───────────────────────────────────────────────────────────────
  const FOOTER_Y = 40;
  page.drawLine({ start: { x: MX, y: FOOTER_Y + 20 }, end: { x: MX + CW, y: FOOTER_Y + 20 }, color: C_BORDER, thickness: 0.5 });
  txt(pdfSettings.footerText, MX, FOOTER_Y + 8, regular, 9, C_FOOTER);
  const genText = `${headerNumber} · Generated ${new Date().toLocaleDateString("en-US")}`;
  txt(genText, MX + CW - regular.widthOfTextAtSize(genText, 9), FOOTER_Y + 8, regular, 9, C_FOOTER);

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
