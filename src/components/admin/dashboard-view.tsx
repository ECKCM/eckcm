"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  UserCheck,
  Clock,
  Banknote,
  Wallet,
  TrendingUp,
  RefreshCw,
  ArrowRight,
  DollarSign,
  Scale,
  HandCoins,
  Heart,
  Sigma,
} from "lucide-react";
import { MoneyValue } from "@/contexts/money-visibility-context";
import { formatCurrency } from "@/lib/utils/formatters";
import {
  formatMoney,
  grossCollectedCents,
  netCollectedCents,
} from "@/app/(admin)/admin/registrations/registrations-types";
import { TrendAreaChart, BarList } from "./mini-charts";
import {
  type DashRow,
  type Granularity,
  ACTIVE_STATUSES,
  DASH_SELECT,
  mapDashRows,
  buildTrend,
  collectionsByMethod,
} from "./dashboard-data";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
  is_active: boolean;
  is_default: boolean;
}

type Metric = "new" | "cumulative";

const STATUS_COLOR: Record<string, string> = {
  PAID: "text-green-600",
  APPROVED: "text-blue-600",
  SUBMITTED: "text-amber-600",
  DRAFT: "text-muted-foreground",
  CANCELLED: "text-red-600",
  REFUNDED: "text-red-600",
};

interface MoneyStats {
  funding: { allocatedCents: number; manualCents: number; totalCents: number };
  donations: {
    grossCents: number;
    netCents: number;
    pendingCents: number;
    receivedCount: number;
    pendingCount: number;
  };
}

const EMPTY_MONEY: MoneyStats = {
  funding: { allocatedCents: 0, manualCents: 0, totalCents: 0 },
  donations: {
    grossCents: 0,
    netCents: 0,
    pendingCents: 0,
    receivedCount: 0,
    pendingCount: 0,
  },
};

export function DashboardView({ events }: { events: EventOption[] }) {
  const defaultEvent =
    events.find((e) => e.is_default)?.id ?? events[0]?.id ?? "";
  const [eventId, setEventId] = useState(defaultEvent);
  const [rows, setRows] = useState<DashRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [metric, setMetric] = useState<Metric>("new");
  const [cardSurchargeCents, setCardSurchargeCents] = useState(0);
  const [moneyStats, setMoneyStats] = useState<MoneyStats>(EMPTY_MONEY);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const supabase = createClient();
    const [regResult, surchargeRes, moneyRes] = await Promise.all([
      supabase
        .from("eckcm_registrations")
        .select(DASH_SELECT)
        .eq("event_id", eventId)
        .order("created_at", { ascending: true }),
      fetch(`/api/admin/registrations/card-surcharge?eventId=${eventId}`).catch(
        () => null
      ),
      fetch(`/api/admin/dashboard-money?eventId=${eventId}`).catch(() => null),
    ]);
    setRows(mapDashRows(regResult.data ?? []));
    if (surchargeRes && surchargeRes.ok) {
      try {
        const data = await surchargeRes.json();
        setCardSurchargeCents(data.surchargeCents ?? 0);
      } catch {
        // leave previous value
      }
    }
    if (moneyRes && moneyRes.ok) {
      try {
        const data = (await moneyRes.json()) as MoneyStats;
        setMoneyStats(data);
      } catch {
        // leave previous value
      }
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  // ─── Derived metrics ────────────────────────────────────────────
  const stats = useMemo(() => {
    const byStatus = (s: string) => rows.filter((r) => r.status === s);
    const paid = byStatus("PAID");
    const submitted = byStatus("SUBMITTED");
    const activeRows = rows.filter((r) => ACTIVE_STATUSES.has(r.status));
    const peopleConfirmed = rows
      .filter((r) => r.status === "PAID" || r.status === "APPROVED")
      .reduce((s, r) => s + r.people_count, 0);
    const peopleSubmitted = rows
      .filter(
        (r) =>
          r.status === "PAID" ||
          r.status === "APPROVED" ||
          r.status === "SUBMITTED"
      )
      .reduce((s, r) => s + r.people_count, 0);
    const net = paid.reduce((s, r) => s + netCollectedCents(r), 0);
    const gross = paid.reduce((s, r) => s + grossCollectedCents(r), 0);
    const amountDue = submitted.reduce((s, r) => s + r.total_amount_cents, 0);
    return {
      total: rows.length,
      totalActive: activeRows.length,
      paid: paid.length,
      submitted: submitted.length,
      peopleConfirmed,
      peopleSubmitted,
      net,
      gross,
      amountDue,
    };
  }, [rows]);

  // Card fee reconciliation — surcharge collected from card payers minus the
  // actual Stripe fees taken (gross − net). Positive = the per-person premium
  // more than covered fees; negative = the church absorbed the difference.
  const actualStripeFeesCents = stats.gross - stats.net;
  const feeBalanceCents = cardSurchargeCents - actualStripeFeesCents;

  // Grand total — every money stream the dashboard tracks. NET for paid
  // registrations and donations (real money in hand after Stripe fees), plus
  // the funding total (sponsor commitments + manually-recorded amounts), plus
  // the outstanding Amount Due (SUBMITTED regs still owed) so the figure is
  // the total expected take, not just what has cleared.
  const grandTotalCents =
    stats.net +
    stats.amountDue +
    moneyStats.donations.netCents +
    moneyStats.funding.totalCents;

  const collections = useMemo(() => collectionsByMethod(rows), [rows]);

  const trend = useMemo(() => {
    const series = buildTrend(rows, granularity);
    if (metric === "new") return series;
    let acc = 0;
    return series.map((p) => ({ label: p.label, value: (acc += p.value) }));
  }, [rows, granularity, metric]);

  const avgPerPeriod = useMemo(() => {
    const series = buildTrend(rows, granularity);
    const nonEmpty = series.filter((p) => p.value > 0);
    if (nonEmpty.length === 0) return 0;
    return Math.round((nonEmpty.reduce((s, p) => s + p.value, 0) / nonEmpty.length) * 10) / 10;
  }, [rows, granularity]);

  const statusBars = useMemo(
    () =>
      (["PAID", "APPROVED", "SUBMITTED", "DRAFT", "CANCELLED", "REFUNDED"] as const)
        .map((s) => ({
          label: s,
          value: rows.filter((r) => r.status === s).length,
          colorClass: STATUS_COLOR[s],
        }))
        .filter((b) => b.value > 0),
    [rows]
  );

  const groupBars = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (!ACTIVE_STATUSES.has(r.status)) continue;
      const g = r.reg_group ?? "—";
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [rows]);

  const recent = useMemo(
    () =>
      [...rows]
        .filter((r) => r.status !== "DRAFT")
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 8),
    [rows]
  );

  const granShort: Record<Granularity, string> = { day: "day", week: "week", month: "month" };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger className="w-full sm:w-[260px]">
            <SelectValue placeholder="Select event" />
          </SelectTrigger>
          <SelectContent>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name_en} ({e.year}){e.is_active ? "" : " · archived"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={load}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Refresh"
          aria-label="Refresh dashboard"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <Link
          href="/admin/analytics"
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          Full analytics
          <ArrowRight className="size-4" />
        </Link>
      </div>

      {/* Registration counts — mirrors /admin/registrations summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile
          icon={<Users className="size-4 text-muted-foreground" />}
          label="Total Registrations"
          value={stats.total}
        />
        <StatTile
          icon={<UserCheck className="size-4 text-green-600" />}
          label="Paid"
          value={stats.paid}
        />
        <StatTile
          icon={<Clock className="size-4 text-amber-600" />}
          label="Unpaid (Submitted)"
          value={stats.submitted}
        />
        <StatTile
          icon={<DollarSign className="size-4 text-amber-600" />}
          label="Amount Due"
          value={<MoneyValue>{formatMoney(stats.amountDue)}</MoneyValue>}
        />
        <StatTile
          icon={<Users className="size-4 text-blue-600" />}
          label="People (Confirmed)"
          value={stats.peopleConfirmed}
        />
        <StatTile
          icon={<Users className="size-4 text-sky-600" />}
          label="People (Submitted)"
          value={stats.peopleSubmitted}
        />
      </div>

      {/* Registration money */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile
          icon={<Banknote className="size-4 text-green-600" />}
          label="Net Collected"
          value={<MoneyValue>{formatMoney(stats.net)}</MoneyValue>}
        />
        <StatTile
          icon={<Wallet className="size-4 text-emerald-600" />}
          label="Gross Collected"
          value={<MoneyValue>{formatMoney(stats.gross)}</MoneyValue>}
        />
        <StatTile
          icon={<Scale className="size-4 text-muted-foreground" />}
          label="Card Fee Balance"
          value={
            <MoneyValue>
              {`${feeBalanceCents >= 0 ? "+" : "−"}${formatMoney(
                Math.abs(feeBalanceCents)
              )}`}
            </MoneyValue>
          }
          valueClassName={
            feeBalanceCents >= 0 ? "text-green-600" : "text-red-600"
          }
          hint={
            <MoneyValue>
              {`Surcharge ${formatMoney(
                cardSurchargeCents
              )} − Fees ${formatMoney(actualStripeFeesCents)}`}
            </MoneyValue>
          }
        />
      </div>

      {/* Funding & Donations */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile
          icon={<HandCoins className="size-4 text-orange-600" />}
          label="Funding Total"
          value={
            <MoneyValue>
              {formatMoney(moneyStats.funding.totalCents)}
            </MoneyValue>
          }
          hint={
            <MoneyValue>
              {`Allocated ${formatMoney(
                moneyStats.funding.allocatedCents
              )} + Manual ${formatMoney(moneyStats.funding.manualCents)}`}
            </MoneyValue>
          }
        />
        <StatTile
          icon={<Heart className="size-4 text-pink-600" />}
          label="Donations Received"
          value={
            <MoneyValue>
              {formatMoney(moneyStats.donations.grossCents)}
            </MoneyValue>
          }
          hint={
            <MoneyValue>
              {`Net ${formatMoney(moneyStats.donations.netCents)} · ${
                moneyStats.donations.receivedCount
              } donor${moneyStats.donations.receivedCount === 1 ? "" : "s"}`}
            </MoneyValue>
          }
        />
        <StatTile
          icon={<Clock className="size-4 text-amber-600" />}
          label="Donations Pending"
          value={
            <MoneyValue>
              {formatMoney(moneyStats.donations.pendingCents)}
            </MoneyValue>
          }
          hint={`${moneyStats.donations.pendingCount} awaiting receipt`}
        />
      </div>

      {/* Grand Total — every money stream summed */}
      <GrandTotalCard
        totalCents={grandTotalCents}
        regNetCents={stats.net}
        amountDueCents={stats.amountDue}
        donationNetCents={moneyStats.donations.netCents}
        fundingCents={moneyStats.funding.totalCents}
      />

      {/* Trend chart */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="size-4" />
                Registrations over time
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                avg {avgPerPeriod} / {granShort[granularity]} (active periods)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={metric}
                onChange={(v) => setMetric(v as Metric)}
                options={[
                  { value: "new", label: "New" },
                  { value: "cumulative", label: "Cumulative" },
                ]}
              />
              <Segmented
                value={granularity}
                onChange={(v) => setGranularity(v as Granularity)}
                options={[
                  { value: "day", label: "Day" },
                  { value: "week", label: "Week" },
                  { value: "month", label: "Month" },
                ]}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <TrendAreaChart
            data={trend}
            height={220}
            valueFormatter={(v) => `${v} ${metric === "cumulative" ? "total" : "new"}`}
            emptyLabel={loading ? "Loading…" : "No registrations yet"}
          />
        </CardContent>
      </Card>

      {/* Collections by method + Status */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Collections by Method</CardTitle>
              <Link
                href="/admin/analytics"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Details →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {collections.byMethod.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {loading ? "Loading…" : "No payments collected yet"}
              </p>
            ) : (
              <div className="space-y-2 text-sm">
                {collections.byMethod.map((m) => (
                  <div key={m.bucket} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {m.bucket}
                      <span className="ml-1.5 text-xs">({m.count})</span>
                    </span>
                    <span className="font-medium tabular-nums">
                      <MoneyValue>{formatMoney(m.grossCents)}</MoneyValue>
                    </span>
                  </div>
                ))}
                <div className="mt-1 flex items-center justify-between gap-2 border-t pt-2">
                  <span className="font-semibold">
                    Total
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      ({collections.totalCount})
                    </span>
                  </span>
                  <span className="text-base font-bold tabular-nums">
                    <MoneyValue>{formatMoney(collections.totalGrossCents)}</MoneyValue>
                  </span>
                </div>
                <p className="text-right text-xs text-muted-foreground">
                  Net <MoneyValue>{formatMoney(collections.totalNetCents)}</MoneyValue>
                  {" · "}Fees <MoneyValue>{formatMoney(collections.totalFeesCents)}</MoneyValue>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList data={statusBars} emptyLabel={loading ? "Loading…" : "No data"} />
          </CardContent>
        </Card>
      </div>

      {/* Top groups + Recent */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top Registration Groups</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList data={groupBars} emptyLabel={loading ? "Loading…" : "No data"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Registrations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {recent.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {loading ? "Loading…" : "No registrations yet"}
              </p>
            )}
            {recent.map((r) => (
              <Link
                key={r.id}
                href={`/admin/registrations?view=${r.id}&event=${eventId}`}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {r.rep_name}
                    {r.rep_name_ko ? (
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        {r.rep_name_ko}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.confirmation_code} · {r.people_count}p
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[10px] font-medium uppercase ${
                    STATUS_COLOR[r.status] ?? "text-muted-foreground"
                  }`}
                >
                  {r.status}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  hint,
  valueClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p
        className={`mt-1 truncate text-xl font-bold leading-tight tabular-nums sm:text-2xl ${
          valueClassName ?? ""
        }`}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function GrandTotalCard({
  totalCents,
  regNetCents,
  amountDueCents,
  donationNetCents,
  fundingCents,
}: {
  totalCents: number;
  regNetCents: number;
  amountDueCents: number;
  donationNetCents: number;
  fundingCents: number;
}) {
  return (
    <div className="rounded-xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-100/40 p-5 dark:border-emerald-900 dark:from-emerald-950/40 dark:to-emerald-950/10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-900 dark:text-emerald-200">
            <Sigma className="size-4" />
            Grand Total (Expected)
          </div>
          <p className="mt-1 truncate text-3xl font-bold leading-tight tabular-nums text-emerald-900 dark:text-emerald-100 sm:text-4xl">
            <MoneyValue>{formatCurrency(totalCents, { decimals: 0 })}</MoneyValue>
          </p>
          <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-300/80">
            Registration net + Amount due + Donation net + Funding total
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-4 gap-x-4 gap-y-1 text-right text-xs sm:text-sm">
          <span className="text-muted-foreground">Reg. Net</span>
          <span className="text-muted-foreground">Amount Due</span>
          <span className="text-muted-foreground">Donations Net</span>
          <span className="text-muted-foreground">Funding</span>
          <span className="font-semibold tabular-nums">
            <MoneyValue>{formatCurrency(regNetCents, { decimals: 0 })}</MoneyValue>
          </span>
          <span className="font-semibold tabular-nums">
            <MoneyValue>{formatCurrency(amountDueCents, { decimals: 0 })}</MoneyValue>
          </span>
          <span className="font-semibold tabular-nums">
            <MoneyValue>
              {formatCurrency(donationNetCents, { decimals: 0 })}
            </MoneyValue>
          </span>
          <span className="font-semibold tabular-nums">
            <MoneyValue>{formatCurrency(fundingCents, { decimals: 0 })}</MoneyValue>
          </span>
        </div>
      </div>
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
