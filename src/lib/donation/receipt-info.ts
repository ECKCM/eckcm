/**
 * Organization legal info for donation tax receipts (US / IRS).
 *
 * ⚠️ 확인 필요 (CONFIRM BEFORE GOING LIVE):
 * 아래 값은 IRS 기부금 영수증(written acknowledgment)에 들어가는 법적 정보입니다.
 * 단체 회계사/담당자와 함께 정확한 값으로 확정하세요. 특히:
 *   - ORG_LEGAL_NAME : 면세 등록상의 정확한 "법적 명칭"
 *   - ORG_EIN        : 연방 세금 ID (없으면 빈 문자열 → 영수증에서 자동 생략)
 *   - TAX_EXEMPT_STATEMENT : 501(c)(3) / tax-deductible 문구
 *
 * IRS Pub. 1771 기준, 기부자에게 보내는 acknowledgment 필수 항목:
 *   (1) 단체명  (2) 기부 금액  (3) "재화/용역 제공 여부" 진술
 *       (제공되지 않았으면 "no goods or services were provided" 명시)
 * EIN은 권장이나 필수는 아님 → 비워두면 영수증에서 자동 생략됩니다.
 */
export interface DonationReceiptOrgInfo {
  legalName: string;
  /** Federal Tax ID (EIN). Empty string → omitted from the receipt. */
  ein: string;
  addressLines: string[];
  contactEmail: string;
  /** Tax-deductibility / 501(c)(3) acknowledgment statement. */
  taxExemptStatement: string;
}

export const DONATION_RECEIPT_ORG_INFO: DonationReceiptOrgInfo = {
  // 확정됨: 법적 등록 법인명 (DBA ECKCM)
  legalName: "Empower Ministry Group Inc, DBA ECKCM",
  // 확정됨: 연방 세금 ID (EIN)
  ein: "20-5105419",
  // 수표 우편 주소와 동일 (send-confirmation.ts 기준)
  addressLines: ["574 Mountain Shadow Ln", "Maryville, TN 37803"],
  contactEmail: "contact@eckcm.com",
  // 확정됨: 501(c)(3) 문구 + IRS 필수 "no goods or services" 진술
  taxExemptStatement:
    "ECKCM is a 501(c)(3) nonprofit organization. All donations are tax-deductible. " +
    "No goods or services were provided in exchange for this contribution. " +
    "Please retain this receipt for your tax records.",
};

/**
 * Minimum fields legally required to send a compliant acknowledgment.
 * If false, the send function logs a warning and skips sending.
 */
export function isReceiptOrgInfoComplete(
  info: DonationReceiptOrgInfo = DONATION_RECEIPT_ORG_INFO
): boolean {
  return info.legalName.trim() !== "" && info.taxExemptStatement.trim() !== "";
}

/**
 * Human-readable receipt number derived from the donation UUID.
 * Deterministic (no schema change needed): DON-XXXXXXXX
 */
export function donationReceiptNumber(donationId: string): string {
  const head = donationId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `DON-${head}`;
}
