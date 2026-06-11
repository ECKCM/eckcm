import {
  grossCollectedCents,
  netCollectedCents,
} from "@/app/(admin)/admin/registrations/registrations-types";
import type { TrendPoint } from "./mini-charts";

/**
 * Shared data layer for the admin Dashboard and the Analytics detail page.
 * Both fetch the same lean registration shape with the browser Supabase client
 * (admin RLS allows the read), then derive metrics from these pure helpers.
 */

export const ACTIVE_STATUSES = new Set(["PAID", "SUBMITTED", "APPROVED"]);

export type Granularity = "day" | "week" | "month";

export interface DashRow {
  id: string;
  confirmation_code: string;
  status: string;
  created_at: string;
  total_amount_cents: number;
  people_count: number;
  reg_group: string | null;
  rep_name: string;
  rep_name_ko: string | null;
  payment_status: string | null;
  payment_method: string | null;
  payment_amount_cents: number;
}

export const DASH_SELECT = `
  id,
  confirmation_code,
  status,
  created_at,
  total_amount_cents,
  registration_group_id,
  eckcm_registration_groups(name_en),
  eckcm_groups(
    eckcm_group_memberships(
      role,
      eckcm_people(first_name_en, last_name_en, display_name_ko)
    )
  ),
  eckcm_invoices(status, total_cents, eckcm_payments(payment_method, status, amount_cents))
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapDashRows(data: any[]): DashRow[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => {
    const groups = r.eckcm_groups ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const members = groups.flatMap((g: any) => g.eckcm_group_memberships ?? []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rep = members.find((m: any) => m.role === "REPRESENTATIVE") ?? members[0];
    const p = rep?.eckcm_people;

    // Primary (oldest) invoice's successful payment, mirroring the table.
    const invoices = [...(r.eckcm_invoices ?? [])];
    let payment_status: string | null = null;
    let payment_method: string | null = null;
    let payment_amount_cents = 0;
    const primary = invoices[0];
    if (primary) {
      const payments = primary.eckcm_payments ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ok = payments.find((x: any) => x.status === "SUCCEEDED") ?? payments[0];
      payment_status = ok?.status ?? primary.status ?? null;
      payment_method = ok?.payment_method ?? null;
      payment_amount_cents = ok?.amount_cents ?? 0;
    }

    return {
      id: r.id,
      confirmation_code: r.confirmation_code,
      status: r.status,
      created_at: r.created_at,
      total_amount_cents: r.total_amount_cents ?? 0,
      people_count: members.length,
      reg_group: r.eckcm_registration_groups?.name_en ?? null,
      rep_name: p
        ? `${p.first_name_en ?? ""} ${p.last_name_en ?? ""}`.trim() || "Unknown"
        : "Unknown",
      rep_name_ko: p?.display_name_ko ?? null,
      payment_status,
      payment_method,
      payment_amount_cents,
    };
  });
}

// ─── Payment method buckets ───────────────────────────────────────

export const PAYMENT_BUCKETS = [
  "Card",
  "Zelle",
  "Check",
  "Cash",
  "On-Site",
  "Manual",
] as const;
export type PaymentBucket = (typeof PAYMENT_BUCKETS)[number];

/**
 * Collapse the raw payment_method code into a display bucket. Card includes the
 * wallet variants (all Stripe, fee-bearing); the on-site instrument variants
 * fold into their instrument (Zelle/Check/Cash).
 */
export function paymentBucket(method: string | null): PaymentBucket {
  const m = (method ?? "").toUpperCase();
  if (["CARD", "APPLE_PAY", "GOOGLE_PAY", "AMAZON_PAY", "LINK"].includes(m)) return "Card";
  if (m === "ZELLE" || m === "ONSITE_ZELLE") return "Zelle";
  if (m === "CHECK" || m === "ONSITE_CHECK") return "Check";
  if (m === "CASH" || m === "ONSITE_CASH") return "Cash";
  if (m === "ONSITE") return "On-Site";
  return "Manual";
}

export interface MethodTotals {
  bucket: PaymentBucket;
  count: number;
  people: number;
  grossCents: number;
  feesCents: number;
  netCents: number;
}

export interface CollectionsSummary {
  byMethod: MethodTotals[];
  totalCount: number;
  totalPeople: number;
  totalGrossCents: number;
  totalFeesCents: number;
  totalNetCents: number;
}

/**
 * Collections grouped by payment-method bucket, over PAID registrations only.
 * Net = real money kept (card fees removed; manual methods net == gross), so
 * the totals reconcile to a single integrated grand total ("총 통합").
 */
export function collectionsByMethod(rows: DashRow[]): CollectionsSummary {
  const map = new Map<PaymentBucket, MethodTotals>();
  for (const b of PAYMENT_BUCKETS) {
    map.set(b, { bucket: b, count: 0, people: 0, grossCents: 0, feesCents: 0, netCents: 0 });
  }

  for (const r of rows) {
    if (r.status !== "PAID") continue;
    const gross = grossCollectedCents(r);
    if (gross <= 0) continue;
    const net = netCollectedCents(r);
    const entry = map.get(paymentBucket(r.payment_method))!;
    entry.count += 1;
    entry.people += r.people_count;
    entry.grossCents += gross;
    entry.netCents += net;
    entry.feesCents += gross - net;
  }

  const byMethod = PAYMENT_BUCKETS.map((b) => map.get(b)!).filter((m) => m.count > 0);
  return {
    byMethod,
    totalCount: byMethod.reduce((s, m) => s + m.count, 0),
    totalPeople: byMethod.reduce((s, m) => s + m.people, 0),
    totalGrossCents: byMethod.reduce((s, m) => s + m.grossCents, 0),
    totalFeesCents: byMethod.reduce((s, m) => s + m.feesCents, 0),
    totalNetCents: byMethod.reduce((s, m) => s + m.netCents, 0),
  };
}

// ─── Registration-group breakdown ─────────────────────────────────

export interface GroupTotals {
  name: string;
  count: number;
  people: number;
  grossCents: number;
}

/** Active registrations grouped by registration group, sorted by count desc. */
export function collectionsByGroup(rows: DashRow[]): GroupTotals[] {
  const map = new Map<string, GroupTotals>();
  for (const r of rows) {
    if (!ACTIVE_STATUSES.has(r.status)) continue;
    const name = r.reg_group ?? "—";
    const entry = map.get(name) ?? { name, count: 0, people: 0, grossCents: 0 };
    entry.count += 1;
    entry.people += r.people_count;
    if (r.status === "PAID") entry.grossCents += grossCollectedCents(r);
    map.set(name, entry);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

// ─── Time-series bucketing (US Eastern) ───────────────────────────

/** Eastern (America/New_York) calendar date "YYYY-MM-DD" for a timestamp. */
export function easternYmd(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function ymdToUTC(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function mondayOf(ymd: string): Date {
  const dt = ymdToUTC(ymd);
  const dow = dt.getUTCDay(); // 0 Sun .. 6 Sat
  dt.setUTCDate(dt.getUTCDate() - ((dow + 6) % 7));
  return dt;
}

const toKey = (dt: Date) => dt.toISOString().slice(0, 10);
const labelDay = (dt: Date) =>
  dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const labelMonth = (dt: Date) =>
  dt.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Bucket active registrations by Eastern created_at into an ordered, gap-filled
 * series of per-bucket counts.
 */
export function buildTrend(rows: DashRow[], granularity: Granularity): TrendPoint[] {
  const dated = rows
    .filter((r) => ACTIVE_STATUSES.has(r.status))
    .map((r) => easternYmd(r.created_at))
    .sort();
  if (dated.length === 0) return [];

  const counts = new Map<string, number>();
  const keyFor = (ymd: string): string => {
    if (granularity === "day") return ymd;
    if (granularity === "week") return toKey(mondayOf(ymd));
    return ymd.slice(0, 7);
  };
  for (const ymd of dated) {
    const k = keyFor(ymd);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const firstYmd = dated[0];
  const lastYmd = dated[dated.length - 1];
  const ordered: { key: string; label: string }[] = [];

  if (granularity === "month") {
    let y = Number(firstYmd.slice(0, 4));
    let m = Number(firstYmd.slice(5, 7));
    const endY = Number(lastYmd.slice(0, 4));
    const endM = Number(lastYmd.slice(5, 7));
    while (y < endY || (y === endY && m <= endM)) {
      ordered.push({
        key: `${y}-${String(m).padStart(2, "0")}`,
        label: labelMonth(new Date(Date.UTC(y, m - 1, 1))),
      });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
  } else {
    const step = granularity === "week" ? 7 : 1;
    const start = granularity === "week" ? mondayOf(firstYmd) : ymdToUTC(firstYmd);
    const end = granularity === "week" ? mondayOf(lastYmd) : ymdToUTC(lastYmd);
    for (let dt = start; dt <= end; dt.setUTCDate(dt.getUTCDate() + step)) {
      ordered.push({ key: toKey(dt), label: labelDay(dt) });
    }
  }

  return ordered.map(({ key, label }) => ({ label, value: counts.get(key) ?? 0 }));
}
