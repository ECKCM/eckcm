"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/hooks/use-realtime";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
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
import { toast } from "sonner";
import { GripVertical, X, Star, Calendar, Loader2, ArrowUpDown, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

// Willow rooms / registrants share one pool across EM + Hansamo.
const WILLOW_CATEGORIES = ["LODGING_WILLOW_EM", "LODGING_WILLOW_HANSAMO"];
const ACTIVE_STATUSES = ["SUBMITTED", "APPROVED", "PAID"];

// ─── Types ──────────────────────────────────────────────────────

interface Event {
  id: string;
  name_en: string;
  year: number;
}

interface Participant {
  membershipId: string;
  firstName: string;
  lastName: string;
  displayNameKo: string | null;
  groupCode: string;
  churchName: string | null;
  lodgingType: string;
  isHansamo: boolean;
  gender: string;
  age: number | null;
  stayStart: string | null;
  stayEnd: string | null;
  regOrder: string; // registration created_at — for "registration order" sort
  memberOrder: string; // membership created_at — tiebreak within a registration
}

interface Occupant {
  assignmentId: string;
  membershipId: string;
  firstName: string;
  lastName: string;
  displayNameKo: string | null;
  isHansamo: boolean;
  gender: string;
}

type CategoryFilter = "ALL" | "EM" | "HANSAMO";
type SortBy =
  | "name_az"
  | "name_za"
  | "age_old"
  | "age_young"
  | "stay_early"
  | "stay_late"
  | "gender_mf"
  | "gender_fm"
  | "reg_first"
  | "reg_last";

interface WillowRoom {
  id: string;
  roomNumber: string;
  suiteKey: string; // e.g. "WLW-101" — rooms in the same suite cluster together
  suiteLabel: string; // e.g. "101"
  capacity: number;
  floorNumber: number;
  floorName: string;
  occupants: Occupant[]; // ordered by assigned_at (earliest first)
}

interface SuiteGroup {
  key: string;
  label: string;
  rooms: WillowRoom[];
}

interface FloorGroup {
  floorNumber: number;
  floorName: string;
  suites: SuiteGroup[];
}

// ─── Helpers ────────────────────────────────────────────────────

function personLabel(p: { firstName: string; lastName: string; displayNameKo: string | null }) {
  const en = `${p.firstName} ${p.lastName}`.trim();
  return p.displayNameKo ? `${p.displayNameKo} (${en})` : en || "—";
}

function lodgingShort(lodgingType: string) {
  return lodgingType === "LODGING_WILLOW_HANSAMO" ? "Hansamo" : "EM";
}

// Gender color coding — male = blue, female = rose, undisclosed = slate.
function genderAccent(gender: string): string {
  if (gender === "MALE") return "border-l-4 border-l-blue-400 bg-blue-50/60";
  if (gender === "FEMALE") return "border-l-4 border-l-rose-400 bg-rose-50/60";
  return "border-l-4 border-l-slate-300 bg-muted/30";
}
function genderDot(gender: string): string {
  if (gender === "MALE") return "bg-blue-500";
  if (gender === "FEMALE") return "bg-rose-500";
  return "bg-slate-400";
}
function genderText(gender: string): string {
  if (gender === "MALE") return "text-blue-700";
  if (gender === "FEMALE") return "text-rose-700";
  return "text-slate-600";
}

function fmtDate(d: string | null) {
  if (!d) return null;
  const dt = new Date(d + "T00:00:00");
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

/** "WLW-101A" → suite key "WLW-101" (strip the trailing room letter). */
function suiteKeyOf(roomNumber: string): string {
  return roomNumber.replace(/[A-Za-z]+$/, "");
}

// ─── Main Component ─────────────────────────────────────────────

export function WillowAssignment({ events }: { events: Event[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [unassigned, setUnassigned] = useState<Participant[]>([]);
  const [rooms, setRooms] = useState<WillowRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [personSearch, setPersonSearch] = useState("");
  const [roomSearch, setRoomSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortBy>("name_az");
  const [floorFilter, setFloorFilter] = useState<string>("ALL");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [quickPerson, setQuickPerson] = useState("");
  const [quickRoom, setQuickRoom] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // ─── Data loading ─────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const supabase = createClient();

    const [roomsRes, assignmentsRes, candidatesRes] = await Promise.all([
      supabase
        .from("eckcm_rooms")
        .select(`
          id, room_number, capacity, fee_category_code,
          eckcm_floors!inner(
            floor_number, name_en, sort_order,
            eckcm_buildings!inner(name_en, short_code, is_active)
          )
        `)
        .in("fee_category_code", WILLOW_CATEGORIES)
        .eq("is_available", true),
      supabase
        .from("eckcm_willow_assignments")
        .select(`
          id, room_id, membership_id, assigned_at,
          eckcm_group_memberships!inner(
            eckcm_people!inner(first_name_en, last_name_en, display_name_ko, gender),
            eckcm_groups!inner(lodging_type)
          )
        `)
        .eq("event_id", eventId)
        .order("assigned_at", { ascending: true }),
      supabase
        .from("eckcm_groups")
        .select(`
          id, display_group_code, lodging_type,
          eckcm_registrations!inner(status, start_date, end_date, created_at),
          eckcm_group_memberships(
            id, created_at, stay_start_date, stay_end_date,
            eckcm_people!inner(
              first_name_en, last_name_en, display_name_ko, gender, age_at_event,
              church_other, eckcm_churches(name_en)
            )
          )
        `)
        .eq("event_id", eventId)
        .in("lodging_type", WILLOW_CATEGORIES)
        .in("eckcm_registrations.status", ACTIVE_STATUSES),
    ]);

    // Build occupants per room (ordered by assigned_at) + assigned membership set
    const occupantsByRoom = new Map<string, Occupant[]>();
    const assignedMembershipIds = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (assignmentsRes.data ?? []) as any[]) {
      const m = a.eckcm_group_memberships;
      const person = m?.eckcm_people;
      if (!person) continue;
      assignedMembershipIds.add(a.membership_id);
      const arr = occupantsByRoom.get(a.room_id) ?? [];
      arr.push({
        assignmentId: a.id,
        membershipId: a.membership_id,
        firstName: person.first_name_en ?? "",
        lastName: person.last_name_en ?? "",
        displayNameKo: person.display_name_ko ?? null,
        isHansamo: m.eckcm_groups?.lodging_type === "LODGING_WILLOW_HANSAMO",
        gender: person.gender ?? "",
      });
      occupantsByRoom.set(a.room_id, arr);
    }

    // Build rooms
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builtRooms: WillowRoom[] = ((roomsRes.data ?? []) as any[])
      .filter((r) => r.eckcm_floors?.eckcm_buildings?.is_active)
      .map((r) => {
        const floor = r.eckcm_floors;
        const suiteKey = suiteKeyOf(r.room_number);
        return {
          id: r.id,
          roomNumber: r.room_number,
          suiteKey,
          suiteLabel: suiteKey.replace(/^WLW-/, ""),
          capacity: r.capacity,
          floorNumber: floor.floor_number,
          floorName: floor.name_en ?? `Floor ${floor.floor_number}`,
          occupants: occupantsByRoom.get(r.id) ?? [],
        };
      });
    builtRooms.sort((a, b) =>
      a.floorNumber !== b.floorNumber
        ? a.floorNumber - b.floorNumber
        : a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })
    );

    // Build unassigned participants (exclude already assigned)
    const participants: Participant[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const g of (candidatesRes.data ?? []) as any[]) {
      const reg = Array.isArray(g.eckcm_registrations)
        ? g.eckcm_registrations[0]
        : g.eckcm_registrations;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const m of (g.eckcm_group_memberships ?? []) as any[]) {
        const person = m.eckcm_people;
        if (!person || assignedMembershipIds.has(m.id)) continue;
        participants.push({
          membershipId: m.id,
          firstName: person.first_name_en ?? "",
          lastName: person.last_name_en ?? "",
          displayNameKo: person.display_name_ko ?? null,
          groupCode: g.display_group_code ?? "",
          churchName: person.church_other || person.eckcm_churches?.name_en || null,
          lodgingType: g.lodging_type,
          isHansamo: g.lodging_type === "LODGING_WILLOW_HANSAMO",
          gender: person.gender ?? "",
          age: person.age_at_event ?? null,
          stayStart: m.stay_start_date ?? reg?.start_date ?? null,
          stayEnd: m.stay_end_date ?? reg?.end_date ?? null,
          regOrder: reg?.created_at ?? "",
          memberOrder: m.created_at ?? "",
        });
      }
    }
    participants.sort((a, b) =>
      personLabel(a).localeCompare(personLabel(b), "ko")
    );

    setRooms(builtRooms);
    setUnassigned(participants);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Realtime
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedReload = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(loadAll, 400);
  }, [loadAll]);
  useRealtime({ table: "eckcm_willow_assignments", event: "*" }, debouncedReload);

  // ─── Actions ──────────────────────────────────────────────
  const assign = useCallback(
    async (membershipId: string, roomId: string) => {
      const room = rooms.find((r) => r.id === roomId);
      if (room && room.occupants.length >= room.capacity) {
        toast.error(`${room.roomNumber} is full (${room.capacity} max)`);
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.from("eckcm_willow_assignments").insert({
        event_id: eventId,
        room_id: roomId,
        membership_id: membershipId,
      });
      if (error) {
        toast.error(
          error.message.includes("full") ? "Room is already full (max 2)" : error.message
        );
        return;
      }
      toast.success("Participant assigned");
      setUnassigned((prev) => prev.filter((p) => p.membershipId !== membershipId));
      loadAll();
    },
    [eventId, rooms, loadAll]
  );

  const unassign = useCallback(
    async (assignmentId: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("eckcm_willow_assignments")
        .delete()
        .eq("id", assignmentId);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Participant unassigned");
      loadAll();
    },
    [loadAll]
  );

  // ─── Drag & Drop ──────────────────────────────────────────
  const activeParticipant = useMemo(
    () => unassigned.find((p) => p.membershipId === activeId) ?? null,
    [unassigned, activeId]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const roomId = (over.id as string).replace("room-", "");
    if (roomId) assign(active.id as string, roomId);
  };

  // ─── Derived ──────────────────────────────────────────────
  const filteredParticipants = useMemo(() => {
    let result = unassigned;
    if (categoryFilter !== "ALL") {
      const wantHansamo = categoryFilter === "HANSAMO";
      result = result.filter((p) => p.isHansamo === wantHansamo);
    }
    if (personSearch.trim()) {
      const q = personSearch.toLowerCase();
      result = result.filter(
        (p) =>
          personLabel(p).toLowerCase().includes(q) ||
          p.groupCode.toLowerCase().includes(q) ||
          p.churchName?.toLowerCase().includes(q)
      );
    }

    const byName = (a: Participant, b: Participant) =>
      personLabel(a).localeCompare(personLabel(b), "ko");
    const genderRank = (g: string) => (g === "MALE" ? 0 : g === "FEMALE" ? 1 : 2);
    const byAge = (a: Participant, b: Participant) =>
      (a.age ?? 999) - (b.age ?? 999) || byName(a, b);
    const byStay = (a: Participant, b: Participant) =>
      (a.stayStart ?? "9999").localeCompare(b.stayStart ?? "9999") ||
      (a.stayEnd ?? "9999").localeCompare(b.stayEnd ?? "9999") ||
      byName(a, b);
    const byReg = (a: Participant, b: Participant) =>
      a.regOrder.localeCompare(b.regOrder) ||
      a.memberOrder.localeCompare(b.memberOrder) ||
      byName(a, b);

    const sorted = [...result].sort((a, b) => {
      switch (sortBy) {
        case "name_az": return byName(a, b);
        case "name_za": return -byName(a, b);
        case "age_old": return -byAge(a, b);     // oldest → youngest
        case "age_young": return byAge(a, b);     // youngest → oldest
        case "stay_early": return byStay(a, b);   // earliest → latest
        case "stay_late": return -byStay(a, b);   // latest → earliest
        case "gender_mf": return genderRank(a.gender) - genderRank(b.gender) || byName(a, b);
        case "gender_fm": return genderRank(b.gender) - genderRank(a.gender) || byName(a, b);
        case "reg_first": return byReg(a, b);     // earliest registration first
        case "reg_last": return -byReg(a, b);     // latest registration first
        default: return byName(a, b);
      }
    });
    return sorted;
  }, [unassigned, personSearch, categoryFilter, sortBy]);

  const floorOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of rooms) if (!map.has(r.floorNumber)) map.set(r.floorNumber, r.floorName);
    return Array.from(map.entries())
      .map(([number, name]) => ({ number, name }))
      .sort((a, b) => a.number - b.number);
  }, [rooms]);

  const floors = useMemo<FloorGroup[]>(() => {
    let base = rooms;
    if (floorFilter !== "ALL") {
      base = base.filter((r) => String(r.floorNumber) === floorFilter);
    }
    const filtered = roomSearch.trim()
      ? base.filter(
          (r) =>
            r.roomNumber.toLowerCase().includes(roomSearch.toLowerCase()) ||
            r.occupants.some((o) =>
              personLabel(o).toLowerCase().includes(roomSearch.toLowerCase())
            )
        )
      : base;
    // Group: floor → suite cluster → rooms
    const floorMap = new Map<number, Map<string, SuiteGroup>>();
    const floorMeta = new Map<number, string>();
    for (const r of filtered) {
      floorMeta.set(r.floorNumber, r.floorName);
      const suites = floorMap.get(r.floorNumber) ?? new Map<string, SuiteGroup>();
      const suite = suites.get(r.suiteKey) ?? {
        key: r.suiteKey,
        label: r.suiteLabel,
        rooms: [],
      };
      suite.rooms.push(r);
      suites.set(r.suiteKey, suite);
      floorMap.set(r.floorNumber, suites);
    }
    return Array.from(floorMap.entries())
      .map(([floorNumber, suites]) => ({
        floorNumber,
        floorName: floorMeta.get(floorNumber) ?? `Floor ${floorNumber}`,
        suites: Array.from(suites.values())
          .map((s) => ({
            ...s,
            rooms: [...s.rooms].sort((a, b) =>
              a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })
            ),
          }))
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
      }))
      .sort((a, b) => a.floorNumber - b.floorNumber);
  }, [rooms, roomSearch, floorFilter]);

  const stats = useMemo(() => {
    const totalBeds = rooms.reduce((s, r) => s + r.capacity, 0);
    const occupied = rooms.reduce((s, r) => s + r.occupants.length, 0);
    const roomsUsed = rooms.filter((r) => r.occupants.length > 0).length;
    return {
      assigned: occupied,
      unassigned: unassigned.length,
      totalBeds,
      rooms: rooms.length,
      roomsUsed,
    };
  }, [rooms, unassigned]);

  const allRoomsFlat = useMemo(
    () => rooms.map((r) => ({ id: r.id, label: `${r.roomNumber} (${r.occupants.length}/${r.capacity})` })),
    [rooms]
  );

  // ─── Render ───────────────────────────────────────────────
  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="shrink-0 border-b px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <Select value={eventId} onValueChange={setEventId}>
            <SelectTrigger className="w-[220px] h-9">
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

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground">{stats.assigned}</strong> assigned
            </span>
            <span>
              <strong className="text-amber-600">{stats.unassigned}</strong> unassigned
            </span>
            <span>
              <strong className="text-foreground">{stats.roomsUsed}</strong>/{stats.rooms} rooms used
            </span>
            <span>
              <strong className="text-foreground">{stats.totalBeds}</strong> beds
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-full bg-blue-500" /> Male
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-full bg-rose-500" /> Female
            </span>
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Star className="size-3 fill-amber-500 text-amber-500" />
              ★ = exported to UPJ
            </Badge>
          </div>
        </div>

        {/* Split panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: unassigned participants */}
          <div className="w-[320px] shrink-0 border-r flex flex-col">
            <div className="p-3 border-b space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">
                  Unassigned ({filteredParticipants.length})
                </div>
                <Select
                  value={categoryFilter}
                  onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}
                >
                  <SelectTrigger className="h-7 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL" className="text-xs">All (EM + Hansamo)</SelectItem>
                    <SelectItem value="EM" className="text-xs">EM only</SelectItem>
                    <SelectItem value="HANSAMO" className="text-xs">Hansamo only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <SearchInput
                  placeholder="Search people..."
                  value={personSearch}
                  onValueChange={setPersonSearch}
                  containerClassName="h-8 flex-1"
                  className="text-sm"
                />
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                  <SelectTrigger className="h-8 w-[140px] text-xs shrink-0">
                    <ArrowUpDown className="size-3 mr-1 text-muted-foreground shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name_az" className="text-xs">Name (A–Z)</SelectItem>
                    <SelectItem value="name_za" className="text-xs">Name (Z–A)</SelectItem>
                    <SelectItem value="age_old" className="text-xs">Age: Oldest first</SelectItem>
                    <SelectItem value="age_young" className="text-xs">Age: Youngest first</SelectItem>
                    <SelectItem value="stay_early" className="text-xs">Stay date: Earliest first</SelectItem>
                    <SelectItem value="stay_late" className="text-xs">Stay date: Latest first</SelectItem>
                    <SelectItem value="gender_mf" className="text-xs">Gender: Male → Female</SelectItem>
                    <SelectItem value="gender_fm" className="text-xs">Gender: Female → Male</SelectItem>
                    <SelectItem value="reg_first" className="text-xs">Registration: First</SelectItem>
                    <SelectItem value="reg_last" className="text-xs">Registration: Last</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredParticipants.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">
                  {unassigned.length === 0 ? "All participants assigned!" : "No matches."}
                </p>
              ) : (
                filteredParticipants.map((p) => (
                  <DraggableParticipant key={p.membershipId} participant={p} />
                ))
              )}
            </div>

            {/* Quick assign */}
            <div className="p-3 border-t space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Quick Assign</div>
              <Select value={quickPerson} onValueChange={setQuickPerson}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select person" />
                </SelectTrigger>
                <SelectContent>
                  {unassigned.map((p) => (
                    <SelectItem key={p.membershipId} value={p.membershipId} className="text-xs">
                      {personLabel(p)} · {lodgingShort(p.lodgingType)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={quickRoom} onValueChange={setQuickRoom}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {allRoomsFlat.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="w-full h-8"
                disabled={!quickPerson || !quickRoom}
                onClick={() => {
                  assign(quickPerson, quickRoom);
                  setQuickPerson("");
                  setQuickRoom("");
                }}
              >
                Assign
              </Button>
            </div>
          </div>

          {/* Right: rooms by floor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b flex items-center gap-2">
              <Select value={floorFilter} onValueChange={setFloorFilter}>
                <SelectTrigger className="h-8 w-[150px] text-xs shrink-0">
                  <Layers className="size-3 mr-1 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs">All floors</SelectItem>
                  {floorOptions.map((f) => (
                    <SelectItem key={f.number} value={String(f.number)} className="text-xs">
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <SearchInput
                placeholder="Search rooms or occupants..."
                value={roomSearch}
                onValueChange={setRoomSearch}
                containerClassName="h-8 max-w-xs flex-1"
                className="text-sm"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-5">
              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : floors.length === 0 ? (
                <p className="text-center text-muted-foreground py-16">No Willow rooms found.</p>
              ) : (
                floors.map((f) => {
                  const roomCount = f.suites.reduce((s, su) => s + su.rooms.length, 0);
                  return (
                    <div key={f.floorNumber}>
                      <h3 className="text-sm font-medium text-muted-foreground sticky top-0 z-20 bg-background -mx-3 px-3 pt-1 pb-2 border-b">
                        {f.floorName}{" "}
                        <span className="text-xs font-normal">
                          ({f.suites.length} suites · {roomCount} rooms)
                        </span>
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {f.suites.map((suite) => (
                          <div
                            key={suite.key}
                            className="rounded-lg border bg-muted/20 p-2"
                          >
                            <div className="text-[11px] font-semibold text-muted-foreground mb-1.5 px-0.5">
                              Suite {suite.label}
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              {suite.rooms.map((room) => (
                                <RoomCell key={room.id} room={room} onRemove={unassign} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeParticipant ? (
          <ParticipantCard participant={activeParticipant} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Participant card ───────────────────────────────────────────

function DraggableParticipant({ participant }: { participant: Participant }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: participant.membershipId,
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn(isDragging && "opacity-30")}>
      <ParticipantCard participant={participant} />
    </div>
  );
}

function ParticipantCard({
  participant,
  dragging,
}: {
  participant: Participant;
  dragging?: boolean;
}) {
  const stay =
    fmtDate(participant.stayStart) && fmtDate(participant.stayEnd)
      ? `${fmtDate(participant.stayStart)}–${fmtDate(participant.stayEnd)}`
      : null;
  return (
    <Card
      className={cn(
        "cursor-grab active:cursor-grabbing select-none",
        genderAccent(participant.gender),
        dragging && "shadow-lg ring-2 ring-primary"
      )}
    >
      <CardContent className="p-2 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <GripVertical className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium truncate">{personLabel(participant)}</span>
          {participant.age != null && (
            <span className="text-[10px] font-semibold text-foreground/70 shrink-0">
              {participant.age}yrs
            </span>
          )}
          <Badge
            className={cn(
              "text-[9px] px-1 py-0 ml-auto shrink-0",
              participant.isHansamo
                ? "bg-violet-500 hover:bg-violet-500 text-white"
                : "bg-emerald-600 hover:bg-emerald-600 text-white"
            )}
          >
            {lodgingShort(participant.lodgingType)}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 pl-5 text-[10px] text-muted-foreground">
          <span className="font-mono">{participant.groupCode}</span>
          {participant.churchName && <span className="truncate">· {participant.churchName}</span>}
          {stay && (
            <span className="flex items-center gap-0.5 ml-auto shrink-0 font-medium text-foreground/70">
              <Calendar className="size-2.5" />
              {stay}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Room cell (droppable) ──────────────────────────────────────

function RoomCell({
  room,
  onRemove,
}: {
  room: WillowRoom;
  onRemove: (assignmentId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `room-${room.id}` });
  const isFull = room.occupants.length >= room.capacity;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md border p-2 min-h-[72px] transition-colors",
        isOver && "ring-2 ring-primary bg-primary/5",
        isFull ? "bg-muted/40" : "bg-background"
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-xs font-medium">{room.roomNumber}</span>
        <Badge
          variant={room.occupants.length === 0 ? "outline" : isFull ? "default" : "secondary"}
          className="text-[9px]"
        >
          {room.occupants.length}/{room.capacity}
        </Badge>
      </div>
      <div className="space-y-1">
        {room.occupants.length === 0 ? (
          <p className="text-[10px] text-muted-foreground/50 italic">Drop here</p>
        ) : (
          room.occupants.map((o, i) => (
            <div
              key={o.assignmentId}
              className="group flex items-center gap-1 text-[11px] rounded bg-muted/60 px-1.5 py-0.5"
            >
              {i === 0 ? (
                <Star
                  className="size-2.5 fill-amber-500 text-amber-500 shrink-0"
                  aria-label="Exported to UPJ"
                />
              ) : (
                <span className="size-2.5 shrink-0" />
              )}
              <span className={cn("size-2 rounded-full shrink-0", genderDot(o.gender))} />
              <span className={cn("truncate font-medium", genderText(o.gender))}>
                {personLabel(o)}
              </span>
              <span
                className={cn(
                  "text-[8px] px-1 rounded shrink-0",
                  o.isHansamo ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"
                )}
              >
                {o.isHansamo ? "H" : "E"}
              </span>
              <button
                onClick={() => onRemove(o.assignmentId)}
                className="ml-auto opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                title="Unassign"
              >
                <X className="size-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
