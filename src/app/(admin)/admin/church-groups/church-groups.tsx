"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Church,
  Users,
  BedDouble,
  X,
  Check,
  Loader2,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Lodging scope ──────────────────────────────────────────────
// "ac"  → A/C + A/C-VIP only (default).
// "all" → every lodging type, including Willow Hall (view-only there).
type Scope = "ac" | "all";

// VIP registrants are housed in standard A/C rooms (no separate VIP stock),
// so both codes share the same room inventory (LODGING_AC_VIP → LODGING_AC).
const AC_CODES = ["LODGING_AC", "LODGING_AC_VIP"];
const AC_VIP_CODE = "LODGING_AC_VIP";
const CATEGORY_ALIASES: Record<string, string> = { LODGING_AC_VIP: "LODGING_AC" };

/** Fold alias lodging codes to their canonical room-inventory code. */
function canonicalCategory(code: string | null | undefined): string {
  if (!code) return "";
  return CATEGORY_ALIASES[code] ?? code;
}

// Willow Hall is assigned per-participant (eckcm_willow_assignments) in its own
// tool — it can be VIEWED here but not group-assigned to a room.
const WILLOW_CODES = ["LODGING_WILLOW_EM", "LODGING_WILLOW_HANSAMO"];
function isWillowCode(code: string | null | undefined): boolean {
  return !!code && WILLOW_CODES.includes(code);
}

/** Human label for a lodging code (fee-category name, falls back to the code). */
function lodgingLabel(code: string | null, names: Map<string, string>): string {
  if (!code) return "No lodging";
  return names.get(code) ?? code.replace(/^LODGING_/, "").replace(/_/g, " ");
}

const ACTIVE_STATUSES = ["SUBMITTED", "APPROVED", "PAID"];

const NO_CHURCH_KEY = "__none__";
const NO_CHURCH_LABEL = "No church";

// ─── Types ──────────────────────────────────────────────────────

interface Event {
  id: string;
  name_en: string;
  year: number;
}

/** One assignable lodging unit (an eckcm_groups row) inside a registration. */
interface GroupUnit {
  groupId: string;
  displayGroupCode: string;
  memberCount: number;
  isVip: boolean;
  lodgingType: string | null;
  isWillow: boolean;
  roomId: string | null;
  roomNumber: string | null;
}

interface RegistrationCard {
  registrationId: string;
  confirmationCode: string;
  status: string;
  createdAt: string;
  repNameKo: string | null;
  repNameEn: string;
  churchKey: string;
  churchLabel: string;
  memberCount: number;
  isVip: boolean;
  groups: GroupUnit[];
  /** Non-Willow groups that have a room assigned. */
  assignedCount: number;
  /** Non-Willow groups (assignable via this tool). */
  assignableCount: number;
  preferences: { elderly: boolean; handicapped: boolean; firstFloor: boolean } | null;
  /** Free-text "additional requests" the representative entered at registration. */
  additionalRequests: string | null;
}

interface ChurchSection {
  key: string;
  label: string;
  registrations: RegistrationCard[];
  total: number;
  /** Cards with at least one assignable (non-Willow) group. */
  assignable: number;
  /** Cards whose assignable groups are all assigned. */
  assigned: number;
  /** Average registration date (epoch ms) across the church's registrations. */
  avgRegMs: number | null;
}

type SortKey = "count" | "date_asc" | "date_desc" | "name";

/** Format an average registration date in US Eastern time (event basis). */
function formatAvgDate(ms: number | null): string {
  if (ms == null) return "—";
  return new Date(ms).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  });
}

/**
 * Resolve a representative's church to a stable grouping key + display label.
 * Free-text ("Other") churches are prefixed with "Other:" and grouped
 * separately from linked church records, so unverified data-entry is visible.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deriveChurch(rep: any): { key: string; label: string } {
  if (rep) {
    const other = (rep.church_other ?? "").trim();
    if (other) return { key: `other:${other.toLowerCase()}`, label: `Other: ${other}` };
    const linked = (rep.eckcm_churches?.name_en ?? "").trim();
    if (linked) return { key: linked.toLowerCase(), label: linked };
  }
  return { key: NO_CHURCH_KEY, label: NO_CHURCH_LABEL };
}

interface RoomOption {
  id: string;
  roomNumber: string;
  building: string;
  /** Canonical lodging category (fee_category_code) this room belongs to. */
  category: string;
  capacity: number;
  occupied: number;
  buildingSort: number;
  floorSort: number;
}

// ─── Main Component ─────────────────────────────────────────────

export function ChurchGroups({
  events,
  feeCategories,
}: {
  events: Event[];
  feeCategories: { code: string; name_en: string }[];
}) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [scope, setScope] = useState<Scope>("ac");
  const [cards, setCards] = useState<RegistrationCard[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("count");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null);

  const categoryNames = useMemo(
    () => new Map(feeCategories.map((f) => [f.code, f.name_en])),
    [feeCategories]
  );

  // ─── Data Loading ───────────────────────────────────────────

  const loadCards = useCallback(async () => {
    if (!eventId) return;
    const supabase = createClient();

    let query = supabase
      .from("eckcm_groups")
      .select(`
        id,
        display_group_code,
        lodging_type,
        preferences,
        registration_id,
        created_at,
        eckcm_registrations!inner(id, confirmation_code, status, created_at, additional_requests),
        eckcm_group_memberships(
          role,
          eckcm_people(
            first_name_en,
            last_name_en,
            display_name_ko,
            church_other,
            eckcm_churches(name_en)
          )
        ),
        eckcm_room_assignments(
          room_id,
          eckcm_rooms(room_number)
        )
      `)
      .eq("event_id", eventId)
      .in("eckcm_registrations.status", ACTIVE_STATUSES);

    // Scope: A/C only, or every lodging type (incl. Willow).
    query =
      scope === "ac"
        ? query.in("lodging_type", AC_CODES)
        : query.not("lodging_type", "is", null);

    const { data: groupsRaw } = await query.order("created_at", { ascending: true });

    const byRegistration = new Map<string, RegistrationCard>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const g of (groupsRaw ?? []) as any[]) {
      const reg = g.eckcm_registrations;
      if (!reg) continue;

      const memberships = g.eckcm_group_memberships ?? [];
      const memberCount = memberships.length;
      const isVip = g.lodging_type === AC_VIP_CODE;
      const isWillow = isWillowCode(g.lodging_type);

      // Room assignment — PostgREST returns a single object when the FK column
      // (group_id) is UNIQUE, so normalize to an array first.
      const raRaw = g.eckcm_room_assignments;
      const assignments = Array.isArray(raRaw) ? raRaw : raRaw ? [raRaw] : [];
      const ra = assignments[0];
      const roomId: string | null = ra?.room_id ?? null;
      const roomNumber: string | null = ra?.eckcm_rooms?.room_number ?? null;

      // Representative — role REPRESENTATIVE, else first member.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rep: any = memberships.find((m: any) => m.role === "REPRESENTATIVE")?.eckcm_people;
      if (!rep) rep = memberships[0]?.eckcm_people ?? null;

      const unit: GroupUnit = {
        groupId: g.id,
        displayGroupCode: g.display_group_code ?? "",
        memberCount,
        isVip,
        lodgingType: g.lodging_type ?? null,
        isWillow,
        roomId,
        roomNumber,
      };

      const existing = byRegistration.get(reg.id);
      if (existing) {
        existing.groups.push(unit);
        existing.memberCount += memberCount;
        existing.isVip = existing.isVip || isVip;
        if (!isWillow) {
          existing.assignableCount += 1;
          if (roomId) existing.assignedCount += 1;
        }
        // Fill in church/rep from a later group only if still missing.
        if (existing.churchKey === NO_CHURCH_KEY && rep) {
          const d = deriveChurch(rep);
          if (d.key !== NO_CHURCH_KEY) {
            existing.churchKey = d.key;
            existing.churchLabel = d.label;
          }
        }
        if (existing.repNameEn === "Unknown" && rep) {
          existing.repNameKo = rep.display_name_ko ?? null;
          existing.repNameEn = `${rep.first_name_en ?? ""} ${rep.last_name_en ?? ""}`.trim() || "Unknown";
        }
        continue;
      }

      const church = deriveChurch(rep);

      byRegistration.set(reg.id, {
        registrationId: reg.id,
        confirmationCode: reg.confirmation_code ?? "",
        status: reg.status,
        createdAt: reg.created_at ?? "",
        repNameKo: rep?.display_name_ko ?? null,
        repNameEn:
          (rep ? `${rep.first_name_en ?? ""} ${rep.last_name_en ?? ""}`.trim() : "") || "Unknown",
        churchKey: church.key,
        churchLabel: church.label,
        memberCount,
        isVip,
        groups: [unit],
        assignedCount: !isWillow && roomId ? 1 : 0,
        assignableCount: isWillow ? 0 : 1,
        preferences: (g.preferences as RegistrationCard["preferences"]) ?? null,
        additionalRequests: (reg.additional_requests ?? null) as string | null,
      });
    }

    setCards(Array.from(byRegistration.values()));
  }, [eventId, scope]);

  const loadRooms = useCallback(async () => {
    const supabase = createClient();

    let rq = supabase
      .from("eckcm_rooms")
      .select(`
        id, room_number, capacity, fee_category_code,
        eckcm_room_assignments(
          eckcm_groups(eckcm_group_memberships(count))
        ),
        eckcm_floors!inner(
          floor_number, sort_order,
          eckcm_buildings!inner(name_en, short_code, sort_order, is_active)
        )
      `)
      .eq("is_available", true);

    // A/C scope only offers A/C rooms; "all" loads every category's inventory
    // (each card's picker then filters to its own group's lodging category).
    if (scope === "ac") rq = rq.in("fee_category_code", AC_CODES);

    const { data: roomsRaw } = await rq;

    const result: RoomOption[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (roomsRaw ?? []) as any[]) {
      const floor = r.eckcm_floors;
      const building = floor?.eckcm_buildings;
      if (!building?.is_active) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const occupied = (r.eckcm_room_assignments ?? []).reduce((sum: number, a: any) => {
        const mc = a.eckcm_groups?.eckcm_group_memberships;
        const n = Array.isArray(mc) ? mc[0]?.count ?? 0 : 0;
        return sum + n;
      }, 0);

      result.push({
        id: r.id,
        roomNumber: r.room_number,
        building: building.short_code || building.name_en,
        category: canonicalCategory(r.fee_category_code),
        capacity: r.capacity ?? 0,
        occupied,
        buildingSort: building.sort_order ?? 0,
        floorSort: floor.sort_order ?? floor.floor_number ?? 0,
      });
    }

    result.sort(
      (a, b) =>
        a.buildingSort - b.buildingSort ||
        a.floorSort - b.floorSort ||
        a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })
    );
    setRooms(result);
  }, [scope]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadCards(), loadRooms()]);
    setLoading(false);
  }, [loadCards, loadRooms]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Realtime: re-load (debounced) whenever a room assignment changes anywhere,
  // so cards turn green/grey live even when another admin assigns a room.
  const _timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = useCallback(() => {
    if (_timer.current) clearTimeout(_timer.current);
    _timer.current = setTimeout(loadAll, 500);
  }, [loadAll]);

  useRealtime({ table: "eckcm_room_assignments", event: "*" }, scheduleReload);
  useRealtime({ table: "eckcm_groups", event: "*" }, scheduleReload);

  // ─── Assignment ─────────────────────────────────────────────

  const assignRoom = useCallback(
    async (registrationId: string, group: GroupUnit, roomId: string | null) => {
      const room = roomId ? rooms.find((r) => r.id === roomId) ?? null : null;

      // Optimistic update — flips the card colour immediately.
      setCards((prev) =>
        prev.map((c) => {
          if (c.registrationId !== registrationId) return c;
          const groups = c.groups.map((g) =>
            g.groupId === group.groupId
              ? { ...g, roomId, roomNumber: room?.roomNumber ?? null }
              : g
          );
          return {
            ...c,
            groups,
            assignedCount: groups.filter((g) => !g.isWillow && g.roomId).length,
          };
        })
      );

      setSavingGroupId(group.groupId);
      try {
        const res = await fetch(`/api/admin/registrations/${registrationId}/room`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupId: group.groupId, roomId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error || "Failed to update room");
          loadCards(); // revert to server truth
          return;
        }
        toast.success(roomId ? `Room ${room?.roomNumber ?? ""} assigned` : "Room unassigned");
        loadRooms(); // refresh occupancy
      } catch {
        toast.error("Network error");
        loadCards();
      } finally {
        setSavingGroupId(null);
      }
    },
    [rooms, loadCards, loadRooms]
  );

  // ─── Derived: church sections ───────────────────────────────

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();

    const matches = (c: RegistrationCard) => {
      if (
        unassignedOnly &&
        (c.assignableCount === 0 || c.assignedCount === c.assignableCount)
      ) {
        return false;
      }
      if (!q) return true;
      return (
        c.confirmationCode.toLowerCase().includes(q) ||
        c.repNameEn.toLowerCase().includes(q) ||
        (c.repNameKo?.toLowerCase().includes(q) ?? false) ||
        c.churchLabel.toLowerCase().includes(q) ||
        (c.additionalRequests?.toLowerCase().includes(q) ?? false) ||
        c.groups.some((g) => g.roomNumber?.toLowerCase().includes(q))
      );
    };

    const map = new Map<string, ChurchSection>();
    for (const c of cards) {
      if (!matches(c)) continue;
      let s = map.get(c.churchKey);
      if (!s) {
        s = {
          key: c.churchKey,
          label: c.churchLabel,
          registrations: [],
          total: 0,
          assignable: 0,
          assigned: 0,
          avgRegMs: null,
        };
        map.set(c.churchKey, s);
      }
      s.registrations.push(c);
      s.total += 1;
      if (c.assignableCount > 0) {
        s.assignable += 1;
        if (c.assignedCount === c.assignableCount) s.assigned += 1;
      }
    }

    const list = Array.from(map.values());
    for (const s of list) {
      s.registrations.sort((a, b) =>
        a.confirmationCode.localeCompare(b.confirmationCode, undefined, { numeric: true })
      );
      // Average registration date for this church (formatted in Eastern time later).
      const times = s.registrations
        .map((r) => (r.createdAt ? new Date(r.createdAt).getTime() : NaN))
        .filter((t) => !Number.isNaN(t));
      s.avgRegMs = times.length
        ? Math.round(times.reduce((sum, t) => sum + t, 0) / times.length)
        : null;
    }

    // The "No church" bucket always sorts last, whatever the chosen order.
    list.sort((a, b) => {
      if (a.key === NO_CHURCH_KEY) return 1;
      if (b.key === NO_CHURCH_KEY) return -1;
      switch (sortBy) {
        case "count":
          return b.total - a.total || a.label.localeCompare(b.label);
        case "date_asc":
          return (
            (a.avgRegMs ?? Infinity) - (b.avgRegMs ?? Infinity) ||
            a.label.localeCompare(b.label)
          );
        case "date_desc":
          return (
            (b.avgRegMs ?? -Infinity) - (a.avgRegMs ?? -Infinity) ||
            a.label.localeCompare(b.label)
          );
        case "name":
          return a.label.localeCompare(b.label);
        default:
          return 0;
      }
    });
    return list;
  }, [cards, search, unassignedOnly, sortBy]);

  const totals = useMemo(() => {
    let assigned = 0;
    let assignable = 0;
    for (const c of cards) {
      if (c.assignableCount === 0) continue; // pure-Willow / not assignable here
      assignable += 1;
      if (c.assignedCount === c.assignableCount) assigned += 1;
    }
    return { total: cards.length, assigned, unassigned: assignable - assigned };
  }, [cards]);

  const toggleChurch = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(sections.map((s) => s.key)));

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="shrink-0 border-b px-4 py-2 flex flex-wrap items-center gap-3">
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Select event" />
          </SelectTrigger>
          <SelectContent>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name_en} ({e.year})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
          <TabsList className="h-9">
            <TabsTrigger value="ac" className="text-xs">
              AC only
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs">
              All lodging
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <SearchInput
          placeholder="Search church, name, code, room..."
          value={search}
          onValueChange={setSearch}
          containerClassName="h-9 flex-1 min-w-[200px] max-w-md"
          className="text-sm"
        />

        <div className="flex items-center gap-2">
          <Switch id="unassigned-only" checked={unassignedOnly} onCheckedChange={setUnassignedOnly} />
          <Label htmlFor="unassigned-only" className="text-xs whitespace-nowrap">
            Unassigned only
          </Label>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-9 gap-1 text-xs" onClick={expandAll}>
            <ChevronDown className="size-3.5" />
            Expand all
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1 text-xs" onClick={collapseAll}>
            <ChevronUp className="size-3.5" />
            Collapse all
          </Button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Label className="text-xs whitespace-nowrap text-muted-foreground">Sort</Label>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="h-9 w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="count">Most registrations</SelectItem>
              <SelectItem value="date_asc">Earliest avg. date</SelectItem>
              <SelectItem value="date_desc">Latest avg. date</SelectItem>
              <SelectItem value="name">Church name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <p className="text-center text-muted-foreground text-sm py-12">Loading…</p>
        ) : sections.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-12">
            {cards.length === 0
              ? scope === "ac"
                ? "No A/C registrations for this event yet."
                : "No lodging registrations for this event yet."
              : "No registrations match your filters."}
          </p>
        ) : (
          sections.map((section) => {
            const isCollapsed = collapsed.has(section.key);
            const allAssigned = section.assignable > 0 && section.assigned === section.assignable;
            return (
              <div key={section.key} className="border rounded-lg">
                {/* Church header */}
                <button
                  className="w-full flex items-center gap-2 p-3 hover:bg-muted/50 text-left"
                  onClick={() => toggleChurch(section.key)}
                >
                  <ChevronRight
                    className={cn(
                      "size-4 text-muted-foreground transition-transform shrink-0",
                      !isCollapsed && "rotate-90"
                    )}
                  />
                  <Church className="size-4 text-muted-foreground shrink-0" />
                  <span className="font-semibold text-sm truncate">{section.label}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {section.total} regs
                  </span>
                  <span className="hidden items-center gap-1 text-xs text-muted-foreground whitespace-nowrap shrink-0 sm:flex">
                    <CalendarDays className="size-3" />
                    Avg. {formatAvgDate(section.avgRegMs)}
                  </span>
                  <Badge
                    variant={allAssigned ? "default" : "secondary"}
                    className={cn(
                      "ml-auto text-[11px] shrink-0",
                      allAssigned &&
                        "bg-green-600 hover:bg-green-600 text-white dark:bg-green-700 dark:hover:bg-green-700"
                    )}
                  >
                    {section.assigned}/{section.assignable} assigned
                  </Badge>
                </button>

                {/* Cards */}
                {!isCollapsed && (
                  <div className="border-t p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {section.registrations.map((card) => (
                      <RegistrationCardView
                        key={card.registrationId}
                        card={card}
                        rooms={rooms}
                        scope={scope}
                        categoryNames={categoryNames}
                        savingGroupId={savingGroupId}
                        onAssign={assignRoom}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Summary bar */}
      <div className="shrink-0 border-t px-4 py-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground bg-muted/30">
        <span>
          <strong className="text-foreground">{totals.total}</strong> registrations
        </span>
        <span>
          <strong className="text-green-600 dark:text-green-500">{totals.assigned}</strong> assigned
        </span>
        <span>
          <strong className="text-foreground">{totals.unassigned}</strong> unassigned
        </span>
        <span className="ml-auto">
          <strong className="text-foreground">{sections.length}</strong> churches
        </span>
      </div>
    </div>
  );
}

// ─── Additional-requests highlighting ───────────────────────────
// Roommate / adjacency requests are the ones that affect room assignment,
// so flag these keywords (longer alternatives first to avoid partial 방 hits).
const REQUEST_KEYWORDS = ["옆방", "방", "같이", "room", "next"];
const REQUEST_HIGHLIGHT_RE = new RegExp(`(${REQUEST_KEYWORDS.join("|")})`, "gi");

/** Render free text with assignment-relevant keywords highlighted. */
function HighlightedRequest({ text }: { text: string }) {
  const parts = text.split(REQUEST_HIGHLIGHT_RE);
  return (
    <>
      {parts.map((part, i) =>
        REQUEST_KEYWORDS.some((k) => k.toLowerCase() === part.toLowerCase()) ? (
          <mark
            key={i}
            className="rounded-sm bg-yellow-200 px-0.5 font-medium text-foreground dark:bg-yellow-500/40"
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

// ─── Registration Card ──────────────────────────────────────────

function RegistrationCardView({
  card,
  rooms,
  scope,
  categoryNames,
  savingGroupId,
  onAssign,
}: {
  card: RegistrationCard;
  rooms: RoomOption[];
  scope: Scope;
  categoryNames: Map<string, string>;
  savingGroupId: string | null;
  onAssign: (registrationId: string, group: GroupUnit, roomId: string | null) => void;
}) {
  const fullyAssigned = card.assignableCount > 0 && card.assignedCount === card.assignableCount;
  const partlyAssigned = card.assignedCount > 0 && card.assignedCount < card.assignableCount;
  const multiGroup = card.groups.length > 1;
  const [confirmGroup, setConfirmGroup] = useState<GroupUnit | null>(null);

  const prefs: string[] = [];
  if (card.preferences?.elderly) prefs.push("Elderly");
  if (card.preferences?.handicapped) prefs.push("Accessible");
  if (card.preferences?.firstFloor) prefs.push("1st floor");

  return (
    <Card
      className={cn(
        "transition-colors",
        fullyAssigned &&
          "border-green-300 bg-green-50/60 dark:border-green-900 dark:bg-green-950/20",
        partlyAssigned &&
          "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20"
      )}
    >
      <CardContent className="p-3 space-y-2">
        {/* Top row: confirmation code + badges */}
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-semibold truncate">
            {card.confirmationCode}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {card.isVip && (
              <Badge className="text-[10px] px-1 py-0 bg-amber-500 hover:bg-amber-500 text-white">
                VIP
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px] gap-0.5">
              <Users className="size-2.5" />
              {card.memberCount}
            </Badge>
          </div>
        </div>

        {/* Representative name */}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {card.repNameKo || card.repNameEn}
          </p>
          {card.repNameKo && (
            <p className="text-xs text-muted-foreground truncate">{card.repNameEn}</p>
          )}
        </div>

        {/* Preferences */}
        {prefs.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {prefs.map((p) => (
              <Badge
                key={p}
                variant="outline"
                className="text-[10px] px-1 py-0 text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-800"
              >
                {p}
              </Badge>
            ))}
          </div>
        )}

        {/* Additional requests (highlight roommate / adjacency keywords) */}
        {card.additionalRequests && card.additionalRequests.trim() && (
          <div className="rounded-md border border-dashed bg-muted/40 px-2 py-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Additional requests
            </p>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-snug">
              <HighlightedRequest text={card.additionalRequests} />
            </p>
          </div>
        )}

        {/* Room assignment per group */}
        <div className="space-y-1.5 pt-0.5">
          {card.groups.map((g) => {
            // Offer only rooms matching this group's lodging category.
            const groupRooms = rooms.filter(
              (r) => r.category === canonicalCategory(g.lodgingType)
            );
            return (
              <div key={g.groupId} className="flex flex-wrap items-center gap-1.5">
                {scope === "all" && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                    {lodgingLabel(g.lodgingType, categoryNames)}
                  </Badge>
                )}
                {multiGroup && (
                  <span className="font-mono text-[10px] text-muted-foreground w-12 shrink-0 truncate">
                    {g.displayGroupCode}
                  </span>
                )}
                {g.isWillow ? (
                  // Willow Hall is assigned per-participant in its own tool.
                  <span className="ml-auto text-[11px] italic text-muted-foreground shrink-0">
                    → Willow Hall tool
                  </span>
                ) : g.roomNumber ? (
                  <>
                    <Badge className="gap-1 bg-green-600 hover:bg-green-600 text-white dark:bg-green-700 dark:hover:bg-green-700">
                      <BedDouble className="size-3" />
                      {g.roomNumber}
                    </Badge>
                    <div className="ml-auto flex items-center gap-0.5">
                      <RoomPicker
                        rooms={groupRooms}
                        currentRoomId={g.roomId}
                        saving={savingGroupId === g.groupId}
                        triggerLabel="Change"
                        onSelect={(roomId) => onAssign(card.registrationId, g, roomId)}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        disabled={savingGroupId === g.groupId}
                        onClick={() => setConfirmGroup(g)}
                        aria-label="Unassign room"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div
                    className={cn(
                      multiGroup || scope === "all" ? "flex-1 min-w-[120px]" : "w-full"
                    )}
                  >
                    <RoomPicker
                      rooms={groupRooms}
                      currentRoomId={null}
                      saving={savingGroupId === g.groupId}
                      triggerLabel="Assign room"
                      fullWidth
                      onSelect={(roomId) => onAssign(card.registrationId, g, roomId)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <AlertDialog
          open={confirmGroup !== null}
          onOpenChange={(o) => {
            if (!o) setConfirmGroup(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unassign room?</AlertDialogTitle>
              <AlertDialogDescription>
                Remove room <strong>{confirmGroup?.roomNumber}</strong> from{" "}
                {card.repNameKo || card.repNameEn} ({card.confirmationCode})? The room
                will become available again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="!bg-destructive !text-white hover:!bg-destructive/90"
                onClick={() => {
                  if (confirmGroup) onAssign(card.registrationId, confirmGroup, null);
                  setConfirmGroup(null);
                }}
              >
                Unassign
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

// ─── Room Picker (searchable popover) ───────────────────────────

function RoomPicker({
  rooms,
  currentRoomId,
  saving,
  triggerLabel,
  fullWidth,
  onSelect,
}: {
  rooms: RoomOption[];
  currentRoomId: string | null;
  saving?: boolean;
  triggerLabel: string;
  fullWidth?: boolean;
  onSelect: (roomId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rooms;
    return rooms.filter(
      (r) =>
        r.roomNumber.toLowerCase().includes(s) || r.building.toLowerCase().includes(s)
    );
  }, [rooms, q]);

  const pick = (roomId: string | null) => {
    setOpen(false);
    setQ("");
    onSelect(roomId);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={saving}
          className={cn("h-7 gap-1 text-xs", fullWidth ? "w-full justify-start" : "px-2")}
        >
          {saving ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <BedDouble className="size-3" />
          )}
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <div className="border-b p-2">
          <SearchInput
            placeholder="Search rooms…"
            value={q}
            onValueChange={setQ}
            containerClassName="h-8"
            className="text-sm"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {currentRoomId && (
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-destructive hover:bg-accent"
              onClick={() => pick(null)}
            >
              <X className="size-3.5 shrink-0" />
              Unassign room
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No rooms found.</p>
          ) : (
            filtered.map((r) => {
              const isFull = r.capacity > 0 && r.occupied >= r.capacity;
              const isCurrent = r.id === currentRoomId;
              return (
                <button
                  key={r.id}
                  onClick={() => pick(r.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent",
                    isCurrent && "bg-accent"
                  )}
                >
                  <span className="font-mono font-medium w-12 shrink-0">{r.roomNumber}</span>
                  <span className="text-muted-foreground truncate flex-1">{r.building}</span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      isFull
                        ? "text-orange-600 dark:text-orange-400 font-medium"
                        : "text-muted-foreground"
                    )}
                  >
                    {r.occupied}/{r.capacity}
                  </span>
                  {isCurrent && <Check className="size-3.5 shrink-0 text-green-600" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
