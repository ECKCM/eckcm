import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Star, Users, ExternalLink } from "lucide-react";
import { RegistrationActions } from "./registration-actions";
import { MoneyValue } from "@/contexts/money-visibility-context";
import type { LockInfo } from "@/lib/hooks/use-registration-lock";
import {
  type Event,
  type RegistrationRow,
  statusVariant,
  paymentStatusVariant,
  formatMoney,
  formatTimestamp,
  extractSeqNumber,
  grossCollectedCents,
} from "./registrations-types";

/**
 * Everything a column's cell renderer might need beyond the row itself.
 * Passed down from RegistrationsTable so renderers stay pure module functions.
 */
export interface ColumnRenderContext {
  events: Event[];
  eventId: string;
  stripeAccountId: string;
  updatingId: string | null;
  isLockedByOther: (id: string) => LockInfo | null;
  openDetail: (reg: RegistrationRow) => void;
  updateStatus: (regId: string, newStatus: string) => Promise<void>;
  setHighlightConfirm: (
    v: { regId: string; current: boolean; name: string } | null
  ) => void;
  setProcessedConfirm: (
    v: { regId: string; current: boolean; name: string } | null
  ) => void;
}

export interface ColumnDef {
  /** Stable identifier persisted in the saved layout. Never reuse/rename. */
  id: string;
  /** Header label shown in the table and the settings panel. */
  label: string;
  /** Sort key for SortableTableHead; omit for non-sortable columns. */
  sortKey?: string;
  /** Extra classes for the <TableHead>. */
  headClassName?: string;
  /** Center-align both header and cell. */
  center?: boolean;
  /** Locked columns can't be hidden or reordered (always pinned first). */
  locked?: boolean;
  /** Cell content for a given row. */
  render: (r: RegistrationRow, ctx: ColumnRenderContext) => ReactNode;
}

/**
 * The full column registry in DEFAULT order. The saved layout (DB) only stores
 * { id, visible } pairs and is reconciled against this list, so adding a column
 * here makes it appear automatically for everyone, and removing one is safe.
 */
export const REGISTRATION_COLUMNS: ColumnDef[] = [
  {
    id: "actions",
    label: "Actions",
    locked: true,
    headClassName: "w-[120px]",
    render: (r, ctx) => (
      <div className="flex items-center gap-1">
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              ctx.setHighlightConfirm({ regId: r.id, current: r.is_highlighted, name: r.registrant_name });
            }}
            className="p-0.5 rounded hover:bg-muted transition-colors"
            title={r.is_highlighted ? "Remove highlight" : "Highlight"}
          >
            <Star className={`size-3.5 ${r.is_highlighted ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`} />
          </button>
          <Checkbox
            checked={r.is_processed}
            onClick={(e) => e.stopPropagation()}
            onCheckedChange={() =>
              ctx.setProcessedConfirm({ regId: r.id, current: r.is_processed, name: r.registrant_name })
            }
            className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 data-[state=checked]:text-white"
            title={r.is_processed ? "Mark as not processed" : "Mark as processed"}
            aria-label="Processed"
          />
        </div>
        <RegistrationActions
          registration={r}
          onView={ctx.openDetail}
          onStatusChange={ctx.updateStatus}
          updatingId={ctx.updatingId}
          lockedBy={ctx.isLockedByOther(r.id)}
        />
      </div>
    ),
  },
  {
    id: "seq",
    label: "No.",
    sortKey: "seq_number",
    render: (r) => (
      <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
        {extractSeqNumber(r.confirmation_code)}
      </span>
    ),
  },
  {
    id: "code",
    label: "Code",
    sortKey: "confirmation_code",
    render: (r) => <span className="font-mono text-sm whitespace-nowrap">{r.confirmation_code}</span>,
  },
  {
    id: "name",
    label: "Name",
    sortKey: "registrant_name",
    render: (r) => (
      <div className="whitespace-nowrap">
        <div className="font-medium text-sm">{r.registrant_name}</div>
        {r.registrant_name_ko && (
          <div className="text-xs text-muted-foreground">{r.registrant_name_ko}</div>
        )}
      </div>
    ),
  },
  {
    id: "status",
    label: "Status",
    sortKey: "status",
    render: (r) => (
      <Badge variant={statusVariant[r.status] ?? "secondary"} className="text-xs">
        {r.status}
      </Badge>
    ),
  },
  {
    id: "payment",
    label: "Payment",
    sortKey: "payment_status",
    render: (r) => (
      <div className="space-y-0.5">
        {r.payment_status && (
          <Badge variant={paymentStatusVariant[r.payment_status] ?? "secondary"} className="text-xs">
            {r.payment_status}
          </Badge>
        )}
        {r.payment_method && (
          <div className="text-xs text-muted-foreground">{r.payment_method.replace(/_/g, " ")}</div>
        )}
        {!r.payment_status && !r.payment_method && (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </div>
    ),
  },
  {
    id: "amount",
    label: "Amount",
    sortKey: "total_amount_cents",
    // Stripe fee is Stripe's money, not ours.
    render: (r) => (
      <span className="font-mono text-sm whitespace-nowrap">
        <MoneyValue>{formatMoney(grossCollectedCents(r))}</MoneyValue>
      </span>
    ),
  },
  {
    id: "reg_group",
    label: "Reg. Group",
    sortKey: "registration_group_name",
    render: (r) => <span className="text-xs whitespace-nowrap">{r.registration_group_name ?? "-"}</span>,
  },
  {
    id: "room",
    label: "Room",
    sortKey: "room_numbers",
    render: (r) => (
      <span className="text-xs whitespace-nowrap">
        {r.room_numbers.length > 0 ? r.room_numbers.join(", ") : "-"}
      </span>
    ),
  },
  {
    id: "type",
    label: "Type",
    sortKey: "registration_type",
    render: (r) => <span className="text-xs whitespace-nowrap">{r.registration_type}</span>,
  },
  {
    id: "email",
    label: "Email",
    sortKey: "registrant_email",
    render: (r) => <span className="text-xs whitespace-nowrap">{r.registrant_email ?? "-"}</span>,
  },
  {
    id: "phone",
    label: "Phone",
    sortKey: "registrant_phone",
    render: (r) => <span className="text-xs whitespace-nowrap">{r.registrant_phone ?? "-"}</span>,
  },
  {
    id: "paid_at",
    label: "Paid At",
    sortKey: "paid_at",
    render: (r) => (
      <span className="text-xs whitespace-nowrap">{r.paid_at ? formatTimestamp(r.paid_at) : "-"}</span>
    ),
  },
  {
    id: "checked_in",
    label: "C-IN",
    sortKey: "checked_in",
    center: true,
    render: (r) => (
      <Badge variant={r.checked_in ? "default" : "secondary"} className="text-xs">
        {r.checked_in ? "Yes" : "No"}
      </Badge>
    ),
  },
  {
    id: "checked_out",
    label: "C-OUT",
    sortKey: "checked_out",
    center: true,
    render: (r) => (
      <Badge variant={r.checked_out ? "default" : "secondary"} className="text-xs">
        {r.checked_out ? "Yes" : "No"}
      </Badge>
    ),
  },
  {
    id: "lodging",
    label: "Lodging",
    sortKey: "lodging_type",
    render: (r) => (
      <span className="text-xs whitespace-nowrap">
        {r.lodging_type?.replace(/^LODGING_/, "").replace(/_/g, " ") ?? "-"}
      </span>
    ),
  },
  {
    id: "room_pref",
    label: "Room Pref.",
    render: (r) => (
      <span className="text-xs whitespace-nowrap">
        {r.preferences
          ? [
              r.preferences.elderly && "Elderly",
              r.preferences.handicapped && "Handicapped",
              r.preferences.firstFloor && "1st Floor",
            ]
              .filter(Boolean)
              .join(", ") || "-"
          : "-"}
      </span>
    ),
  },
  {
    id: "people",
    label: "People",
    sortKey: "people_count",
    center: true,
    render: (r) => (
      <span className="inline-flex items-center gap-1 text-sm">
        <Users className="size-3" />
        {r.people_count}
      </span>
    ),
  },
  {
    id: "dates",
    label: "Dates",
    sortKey: "start_date",
    render: (r) => (
      <span className="text-xs whitespace-nowrap">
        {r.start_date} ~ {r.end_date}
      </span>
    ),
  },
  {
    id: "nights",
    label: "Nights",
    sortKey: "nights_count",
    center: true,
    render: (r) => <span className="text-xs">{r.nights_count}</span>,
  },
  {
    id: "church",
    label: "Church",
    sortKey: "registrant_church",
    render: (r) => <span className="text-xs whitespace-nowrap">{r.registrant_church ?? "-"}</span>,
  },
  {
    id: "department",
    label: "Dept.",
    sortKey: "registrant_department",
    render: (r) => <span className="text-xs whitespace-nowrap">{r.registrant_department ?? "-"}</span>,
  },
  {
    id: "guardian",
    label: "Guardian",
    sortKey: "registrant_guardian_name",
    render: (r) =>
      r.registrant_guardian_name ? (
        <div className="text-xs whitespace-nowrap">
          <div>{r.registrant_guardian_name}</div>
          {r.registrant_guardian_phone && (
            <div className="text-muted-foreground">{r.registrant_guardian_phone}</div>
          )}
        </div>
      ) : (
        <span className="text-xs whitespace-nowrap">-</span>
      ),
  },
  {
    id: "invoice",
    label: "Invoice",
    sortKey: "invoice_number",
    render: (r) =>
      r.invoice_id ? (
        <div className="flex items-center gap-1.5 font-mono text-xs whitespace-nowrap">
          <span>{r.invoice_number}</span>
          <a
            href={`/api/invoice/${r.invoice_id}/pdf?type=invoice`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
            title="View Invoice"
          >
            <ExternalLink className="size-3" />
          </a>
          {r.payment_status === "SUCCEEDED" && (
            <a
              href={`/api/invoice/${r.invoice_id}/pdf?type=receipt`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-600 hover:underline"
              title="View Receipt"
            >
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      ) : (
        <span className="font-mono text-xs whitespace-nowrap">-</span>
      ),
  },
  {
    id: "stripe",
    label: "Stripe",
    render: (r, ctx) =>
      r.stripe_payment_intent_id && ctx.stripeAccountId ? (
        <a
          href={`https://dashboard.stripe.com/${ctx.stripeAccountId}/${
            ctx.events.find((e) => e.id === ctx.eventId)?.stripe_mode === "live" ? "" : "test/"
          }payments/${r.stripe_payment_intent_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-blue-600 hover:underline"
        >
          <ExternalLink className="size-3" />
          View
        </a>
      ) : (
        <span className="text-xs text-muted-foreground">-</span>
      ),
  },
  {
    id: "notes",
    label: "Notes",
    sortKey: "notes",
    render: (r) => (
      <span className="block text-xs max-w-[200px] truncate" title={r.notes ?? ""}>
        {r.notes ?? "-"}
      </span>
    ),
  },
  {
    id: "requests",
    label: "Requests",
    sortKey: "additional_requests",
    render: (r) => (
      <span className="block text-xs max-w-[200px] truncate" title={r.additional_requests ?? ""}>
        {r.additional_requests ?? "-"}
      </span>
    ),
  },
  {
    id: "created_at",
    label: "Registered",
    sortKey: "created_at",
    render: (r) => <span className="text-xs whitespace-nowrap">{formatTimestamp(r.created_at)}</span>,
  },
  {
    id: "updated_at",
    label: "Updated",
    sortKey: "updated_at",
    render: (r) => <span className="text-xs whitespace-nowrap">{formatTimestamp(r.updated_at)}</span>,
  },
];

const COLUMN_BY_ID = new Map(REGISTRATION_COLUMNS.map((c) => [c.id, c]));

/** One saved column entry (DB shape). */
export interface ColumnPref {
  id: string;
  visible: boolean;
}

/**
 * Reconcile a saved layout against the current registry:
 * - Locked columns are always first, always visible, never reorderable.
 * - Known saved (non-locked) columns keep their saved order + visibility.
 * - Columns added to the registry since the layout was saved are appended (visible).
 * - Saved ids no longer in the registry are dropped.
 * Passing null/invalid returns the default layout (all visible, registry order).
 */
export function resolveColumnLayout(saved: ColumnPref[] | null | undefined): ColumnDef[] {
  const locked = REGISTRATION_COLUMNS.filter((c) => c.locked);
  const reorderable = REGISTRATION_COLUMNS.filter((c) => !c.locked);

  if (!Array.isArray(saved)) {
    return [...locked, ...reorderable];
  }

  const ordered: ColumnDef[] = [];
  const used = new Set<string>(locked.map((c) => c.id));

  for (const pref of saved) {
    if (!pref || used.has(pref.id)) continue;
    const col = COLUMN_BY_ID.get(pref.id);
    if (!col || col.locked) continue;
    ordered.push(col);
    used.add(col.id);
  }
  // Append any registry columns missing from the saved layout (newly added).
  for (const col of reorderable) {
    if (!used.has(col.id)) ordered.push(col);
  }

  return [...locked, ...ordered];
}

/**
 * Produce the visibility-filtered, ordered columns to actually render, given a
 * resolved layout and the set of hidden ids. Locked columns are never hidden.
 */
export function visibleColumns(layout: ColumnDef[], hidden: Set<string>): ColumnDef[] {
  return layout.filter((c) => c.locked || !hidden.has(c.id));
}
