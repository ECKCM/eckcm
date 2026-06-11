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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, RefreshCw, Wallet, Banknote, Receipt, Users } from "lucide-react";
import { MoneyValue } from "@/contexts/money-visibility-context";
import { formatCurrency } from "@/lib/utils/formatters";
import {
  formatMoney,
  grossCollectedCents,
} from "@/app/(admin)/admin/registrations/registrations-types";
import {
  type DashRow,
  type Granularity,
  ACTIVE_STATUSES,
  DASH_SELECT,
  mapDashRows,
  buildTrend,
  collectionsByMethod,
  collectionsByGroup,
} from "./dashboard-data";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
  is_active: boolean;
  is_default: boolean;
}

const STATUS_ROWS = ["PAID", "APPROVED", "SUBMITTED", "DRAFT", "CANCELLED", "REFUNDED"] as const;

export function AnalyticsView({ events }: { events: EventOption[] }) {
  const defaultEvent =
    events.find((e) => e.is_default)?.id ?? events[0]?.id ?? "";
  const [eventId, setEventId] = useState(defaultEvent);
  const [rows, setRows] = useState<DashRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [granularity, setGranularity] = useState<Granularity>("week");

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_registrations")
      .select(DASH_SELECT)
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });
    setRows(mapDashRows(data ?? []));
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const collections = useMemo(() => collectionsByMethod(rows), [rows]);
  const groups = useMemo(() => collectionsByGroup(rows), [rows]);

  const statusTable = useMemo(
    () =>
      STATUS_ROWS.map((status) => {
        const subset = rows.filter((r) => r.status === status);
        const people = subset.reduce((s, r) => s + r.people_count, 0);
        let amount: number | null = null;
        if (status === "PAID") {
          amount = subset.reduce((s, r) => s + grossCollectedCents(r), 0);
        } else if (status === "SUBMITTED" || status === "APPROVED") {
          amount = subset.reduce((s, r) => s + r.total_amount_cents, 0);
        }
        return { status, count: subset.length, people, amount };
      }).filter((r) => r.count > 0),
    [rows]
  );

  const trendTable = useMemo(() => {
    const series = buildTrend(rows, granularity);
    let acc = 0;
    return series.map((p) => ({ label: p.label, value: p.value, cumulative: (acc += p.value) }));
  }, [rows, granularity]);

  const totals = useMemo(() => {
    const activeRows = rows.filter((r) => ACTIVE_STATUSES.has(r.status));
    const peoplePaid = rows
      .filter((r) => r.status === "PAID")
      .reduce((s, r) => s + r.people_count, 0);
    return {
      activeRegs: activeRows.length,
      peoplePaid,
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          <ArrowLeft className="size-4" />
          Dashboard
        </Link>
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
          aria-label="Refresh analytics"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Headline tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={<Wallet className="size-4 text-emerald-600" />} label="Total Collected (Gross)">
          <MoneyValue>{formatCurrency(collections.totalGrossCents, { decimals: 0 })}</MoneyValue>
        </Tile>
        <Tile icon={<Banknote className="size-4 text-green-600" />} label="Net Kept">
          <MoneyValue>{formatCurrency(collections.totalNetCents, { decimals: 0 })}</MoneyValue>
        </Tile>
        <Tile icon={<Receipt className="size-4 text-muted-foreground" />} label="Card Fees">
          <MoneyValue>{formatCurrency(collections.totalFeesCents, { decimals: 0 })}</MoneyValue>
        </Tile>
        <Tile icon={<Users className="size-4 text-blue-600" />} label="People (Paid)">
          {totals.peoplePaid}
        </Tile>
      </div>

      {/* Payment methods — the integrated breakdown ("총 통합") */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Collections by Payment Method</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Regs</TableHead>
                  <TableHead className="text-right">People</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Fees</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collections.byMethod.map((m) => (
                  <TableRow key={m.bucket}>
                    <TableCell className="font-medium">{m.bucket}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.people}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyValue>{formatMoney(m.grossCents)}</MoneyValue>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {m.feesCents > 0 ? (
                        <MoneyValue>{`−${formatMoney(m.feesCents)}`}</MoneyValue>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      <MoneyValue>{formatMoney(m.netCents)}</MoneyValue>
                    </TableCell>
                  </TableRow>
                ))}
                {collections.byMethod.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      {loading ? "Loading…" : "No payments collected yet"}
                    </TableCell>
                  </TableRow>
                )}
                {collections.byMethod.length > 0 && (
                  <TableRow className="border-t-2 font-bold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{collections.totalCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{collections.totalPeople}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyValue>{formatMoney(collections.totalGrossCents)}</MoneyValue>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {collections.totalFeesCents > 0 ? (
                        <MoneyValue>{`−${formatMoney(collections.totalFeesCents)}`}</MoneyValue>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyValue>{formatMoney(collections.totalNetCents)}</MoneyValue>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Card includes Apple/Google Pay (Stripe fee applies). Zelle, Check, Cash &
            On-Site are manual methods with no processing fee, so their Net equals Gross.
          </p>
        </CardContent>
      </Card>

      {/* Status + Groups */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">By Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Regs</TableHead>
                    <TableHead className="text-right">People</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statusTable.map((s) => (
                    <TableRow key={s.status}>
                      <TableCell className="font-medium">{s.status}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.people}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.amount == null ? (
                          "—"
                        ) : (
                          <MoneyValue>{formatMoney(s.amount)}</MoneyValue>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {statusTable.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        {loading ? "Loading…" : "No data"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Amount = collected (Paid) or owed (Submitted/Approved).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              By Registration Group{" "}
              <span className="font-normal text-muted-foreground">
                ({totals.activeRegs} active)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[360px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Group</TableHead>
                    <TableHead className="text-right">Regs</TableHead>
                    <TableHead className="text-right">People</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((g) => (
                    <TableRow key={g.name}>
                      <TableCell className="max-w-[160px] truncate font-medium">{g.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.count}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.people}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <MoneyValue>{formatMoney(g.grossCents)}</MoneyValue>
                      </TableCell>
                    </TableRow>
                  ))}
                  {groups.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        {loading ? "Loading…" : "No data"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Registrations over time */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Registrations Over Time</CardTitle>
            <div className="inline-flex rounded-md border p-0.5">
              {(["day", "week", "month"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGranularity(g)}
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                    granularity === g
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead className="text-right">Cumulative</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trendTable.map((t, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{t.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.value}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {t.cumulative}
                    </TableCell>
                  </TableRow>
                ))}
                {trendTable.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      {loading ? "Loading…" : "No registrations yet"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 truncate text-xl font-bold leading-tight tabular-nums sm:text-2xl">
        {children}
      </p>
    </div>
  );
}
