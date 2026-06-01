import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DONATION_RECEIPT_ORG_INFO } from "@/lib/donation/receipt-info";

export interface DonationReceiptPdfData {
  receiptNumber: string;
  receiptDate: string;
  donorName: string | null;
  /** Total contribution charged (base + covered fees), formatted. */
  contributionFormatted: string;
  /** Base donation, formatted. Shown only when fees were covered. */
  baseAmountFormatted: string | null;
  /** Processing fee the donor covered, formatted. null → hidden. */
  coveredFeeFormatted: string | null;
  designation: string | null;
  paymentReference: string;
}

const PAGE_W = 595;
const PAGE_H = 842;
const MX = 48;
const CW = PAGE_W - MX * 2; // 499

const C_DARK = rgb(0.059, 0.09, 0.165); // #0f172a
const C_WHITE = rgb(1, 1, 1);
const C_BLACK = rgb(0.067, 0.094, 0.153); // #111827
const C_GRAY_MID = rgb(0.42, 0.447, 0.502); // #6b7280
const C_GRAY_LIGHT = rgb(0.58, 0.639, 0.722); // #94a3b8
const C_BORDER = rgb(0.898, 0.91, 0.922); // #e5e7eb
const C_ROW_SEP = rgb(0.953, 0.957, 0.965); // #f3f4f6
const C_FOOTER = rgb(0.612, 0.639, 0.675); // #9ca3af
const C_GREEN_BG = rgb(0.941, 0.996, 0.957); // #f0fdf4
const C_GREEN_BORDER = rgb(0.733, 0.969, 0.816); // #bbf7d0
const C_GREEN_TEXT = rgb(0.086, 0.502, 0.239); // #15803d
const C_BLUE_BG = rgb(0.937, 0.965, 1); // #eff6ff
const C_BLUE_BORDER = rgb(0.749, 0.859, 0.996); // #bfdbfe
const C_BLUE_TEXT = rgb(0.118, 0.251, 0.686); // #1e40af

export async function generateDonationReceiptPdf(
  data: DonationReceiptPdfData
): Promise<Buffer> {
  const {
    receiptNumber,
    receiptDate,
    donorName,
    contributionFormatted,
    designation,
    paymentReference,
  } = data;

  const org = DONATION_RECEIPT_ORG_INFO;

  const doc = await PDFDocument.create();
  const [regular, bold] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
  ]);
  const page = doc.addPage([PAGE_W, PAGE_H]);

  const txt = (
    text: string,
    x: number,
    y: number,
    font: typeof regular,
    size: number,
    color: ReturnType<typeof rgb>
  ) => page.drawText(String(text), { x, y, font, size, color });

  const truncate = (
    text: string,
    font: typeof regular,
    size: number,
    maxWidth: number
  ): string => {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
    let t = text;
    while (t.length > 0 && font.widthOfTextAtSize(t + "…", size) > maxWidth) {
      t = t.slice(0, -1);
    }
    return t + "…";
  };

  const wrap = (
    text: string,
    font: typeof regular,
    size: number,
    maxWidth: number
  ): string[] => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (line && font.widthOfTextAtSize(test, size) > maxWidth) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  let y = PAGE_H - 40;

  // ─── HEADER ───────────────────────────────────────────────────────────────
  const HEADER_H = 52;
  page.drawRectangle({ x: MX, y: y - HEADER_H, width: CW, height: HEADER_H, color: C_DARK });
  txt(truncate(org.legalName, bold, 16, CW - 160), MX + 24, y - 22, bold, 16, C_WHITE);
  txt("Official Donation Receipt", MX + 24, y - 39, regular, 9, C_GRAY_LIGHT);
  const rightEdge = MX + CW - 24;
  txt("Receipt #", rightEdge - regular.widthOfTextAtSize("Receipt #", 9), y - 23, regular, 9, C_GRAY_LIGHT);
  txt(receiptNumber, rightEdge - bold.widthOfTextAtSize(receiptNumber, 13), y - 39, bold, 13, C_WHITE);
  y -= HEADER_H + 20;

  // ─── INFO ROWS ──────────────────────────────────────────────────────────────
  const ROW_H = 20;
  const infoRows: [string, string][] = [
    ["Receipt Number", receiptNumber],
    ["Date", receiptDate],
    ...(donorName ? ([["Donor", truncate(donorName, bold, 10, CW * 0.65)]] as [string, string][]) : []),
    ...(designation ? ([["Designation", truncate(designation, bold, 10, CW * 0.65)]] as [string, string][]) : []),
    ...(org.ein ? ([["Tax ID (EIN)", org.ein]] as [string, string][]) : []),
  ];
  for (const [label, value] of infoRows) {
    txt(label, MX, y - 14, regular, 10, C_GRAY_MID);
    txt(value, MX + CW - bold.widthOfTextAtSize(value, 10), y - 14, bold, 10, C_BLACK);
    page.drawLine({ start: { x: MX, y: y - ROW_H }, end: { x: MX + CW, y: y - ROW_H }, color: C_ROW_SEP, thickness: 0.5 });
    y -= ROW_H;
  }
  y -= 16;

  // ─── CONTRIBUTION BOX ─────────────────────────────────────────────────────
  txt("CONTRIBUTION", MX, y - 12, bold, 9, C_GRAY_MID);
  y -= 24;

  // Total — the entire amount is the donation (no fee breakdown). Single green
  // highlight band with the full contribution.
  const TOTAL_H = 30;
  page.drawRectangle({
    x: MX, y: y - TOTAL_H, width: CW, height: TOTAL_H,
    color: C_GREEN_BG, borderColor: C_GREEN_BORDER, borderWidth: 0.5,
  });
  txt("Total Tax-Deductible Contribution", MX + 12, y - 19, bold, 11, C_BLACK);
  txt(contributionFormatted, MX + CW - bold.widthOfTextAtSize(contributionFormatted, 14) - 12, y - 20, bold, 14, C_GREEN_TEXT);
  y -= TOTAL_H + 6;

  // Payment reference
  txt("Payment Reference", MX, y - 13, regular, 9, C_GRAY_MID);
  txt(paymentReference, MX + CW - regular.widthOfTextAtSize(paymentReference, 9), y - 13, regular, 9, C_GRAY_MID);
  y -= 28;

  // ─── TAX STATEMENT BLOCK ──────────────────────────────────────────────────
  const stmtLines = wrap(org.taxExemptStatement, regular, 9.5, CW - 24);
  const STMT_H = stmtLines.length * 14 + 20;
  page.drawRectangle({
    x: MX, y: y - STMT_H, width: CW, height: STMT_H,
    color: C_BLUE_BG, borderColor: C_BLUE_BORDER, borderWidth: 0.5,
  });
  let sy = y - 16;
  for (const ln of stmtLines) {
    txt(ln, MX + 12, sy, regular, 9.5, C_BLUE_TEXT);
    sy -= 14;
  }

  // ─── FOOTER (org legal identity) ──────────────────────────────────────────
  const FOOTER_Y = 44;
  page.drawLine({ start: { x: MX, y: FOOTER_Y + 40 }, end: { x: MX + CW, y: FOOTER_Y + 40 }, color: C_BORDER, thickness: 0.5 });
  txt(org.legalName, MX, FOOTER_Y + 28, bold, 9, C_FOOTER);
  const footerLine = [...org.addressLines, org.ein ? `EIN: ${org.ein}` : "", org.contactEmail]
    .filter(Boolean)
    .join("  ·  ");
  txt(truncate(footerLine, regular, 8.5, CW), MX, FOOTER_Y + 16, regular, 8.5, C_FOOTER);
  const genText = `${receiptNumber} · Generated ${receiptDate}`;
  txt(genText, MX, FOOTER_Y + 4, regular, 8, C_FOOTER);

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
