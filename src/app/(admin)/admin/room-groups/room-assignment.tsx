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
import { Input } from "@/components/ui/input";
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
import { toast } from "sonner";
import {
  ChevronRight,
  Building2,
  Layers,
  X,
  GripVertical,
  Search,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface Event {
  id: string;
  name_en: string;
  year: number;
}

interface FeeCategory {
  id: string;
  code: string;
  name_en: string;
}

interface GroupMember {
  first_name_en: string;
  last_name_en: string;
  display_name_ko: string | null;
  church_other: string | null;
  eckcm_churches: { name_en: string } | null;
}

interface UnassignedGroup {
  id: string;
  display_group_code: string;
  member_count: number;
  members: GroupMember[];
  church_name: string | null;
  preferences: Record<string, unknown>;
}

interface RoomAssignmentData {
  id: string;
  group_id: string;
  display_group_code: string;
  member_count: number;
}

interface RoomData {
  id: string;
  room_number: string;
  capacity: number;
  floor_id: string;
  assignments: RoomAssignmentData[];
  occupied: number;
}

interface FloorData {
  id: string;
  floor_number: number;
  name_en: string | null;
  rooms: RoomData[];
}

interface BuildingData {
  id: string;
  name_en: string;
  short_code: string | null;
  floors: FloorData[];
}

// ─── Main Component ─────────────────────────────────────────────

export function RoomAssignment({
  events,
  feeCategories,
}: {
  events: Event[];
  feeCategories: FeeCategory[];
}) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState(feeCategories[0]?.code ?? "");
  const [unassigned, setUnassigned] = useState<UnassignedGroup[]>([]);
  const [buildings, setBuildings] = useState<BuildingData[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [roomSearch, setRoomSearch] = useState("");
  const [showEmptyOnly, setShowEmptyOnly] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [quickGroup, setQuickGroup] = useState("");
  const [quickRoom, setQuickRoom] = useState("");

  // Summary counts
  const [totalGroups, setTotalGroups] = useState(0);
  const [assignedCount, setAssignedCount] = useState(0);

  // Expanded state for buildings/floors
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(new Set());
  const [expandedFloors, setExpandedFloors] = useState<Set<string>>(new Set());

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // ─── Data Loading ───────────────────────────────────────────

  const loadGroups = useCallback(async () => {
    if (!eventId || !activeTab) return;
    const supabase = createClient();

    const { data: groupsRaw } = await supabase
      .from("eckcm_groups")
      .select(`
        id,
        display_group_code,
        lodging_type,
        preferences,
        eckcm_registrations!inner(status),
        eckcm_group_memberships(
          eckcm_people(
            first_name_en,
            last_name_en,
            display_name_ko,
            church_other,
            eckcm_churches(name_en)
          )
        ),
        eckcm_room_assignments(id)
      `)
      .eq("event_id", eventId)
      .in("eckcm_registrations.status", ["SUBMITTED", "APPROVED", "PAID"])
      .order("created_at", { ascending: true });

    const unassignedForTab: UnassignedGroup[] = [];
    let totalForTab = 0;
    let assignedForTab = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const g of (groupsRaw ?? []) as any[]) {
      // Match groups to tab: by lodging_type column, or show in all tabs if unset
      const lt = g.lodging_type as string | null;
      if (lt && lt !== activeTab) continue;
      totalForTab++;

      const hasAssignment = (g.eckcm_room_assignments ?? []).length > 0;
      if (hasAssignment) {
        assignedForTab++;
        continue;
      }

      const memberships = g.eckcm_group_memberships ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const members: GroupMember[] = memberships.map((m: any) => m.eckcm_people).filter(Boolean);

      let churchName: string | null = null;
      for (const m of members) {
        churchName = m.church_other || m.eckcm_churches?.name_en || null;
        if (churchName) break;
      }

      unassignedForTab.push({
        id: g.id,
        display_group_code: g.display_group_code,
        member_count: members.length,
        members,
        church_name: churchName,
        preferences: g.preferences ?? {},
      });
    }

    setUnassigned(unassignedForTab);
    setTotalGroups(totalForTab);
    setAssignedCount(assignedForTab);
  }, [eventId, activeTab]);

  const loadRooms = useCallback(async () => {
    if (!activeTab) return;
    const supabase = createClient();

    // Query rooms filtered by fee_category_code, joining up to buildings
    const { data: roomsRaw } = await supabase
      .from("eckcm_rooms")
      .select(`
        id, room_number, capacity, floor_id,
        eckcm_room_assignments(
          id, group_id,
          eckcm_groups(
            display_group_code,
            eckcm_group_memberships(count)
          )
        ),
        eckcm_floors!inner(
          id, floor_number, name_en, sort_order,
          eckcm_buildings!inner(id, name_en, short_code, sort_order, is_active)
        )
      `)
      .eq("fee_category_code", activeTab)
      .eq("is_available", true);

    if (!roomsRaw) {
      setBuildings([]);
      return;
    }

    // Organize into building → floor → room hierarchy
    const buildingMap = new Map<string, BuildingData & { _sortOrder: number }>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of roomsRaw as any[]) {
      const floor = r.eckcm_floors;
      if (!floor?.eckcm_buildings?.is_active) continue;
      const building = floor.eckcm_buildings;

      if (!buildingMap.has(building.id)) {
        buildingMap.set(building.id, {
          id: building.id,
          name_en: building.name_en,
          short_code: building.short_code,
          floors: [],
          _sortOrder: building.sort_order ?? 0,
        });
      }

      const bData = buildingMap.get(building.id)!;
      let fData = bData.floors.find((f) => f.id === floor.id);
      if (!fData) {
        fData = { id: floor.id, floor_number: floor.floor_number, name_en: floor.name_en, rooms: [] };
        bData.floors.push(fData);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assignments: RoomAssignmentData[] = (r.eckcm_room_assignments ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((a: any) => a.eckcm_groups)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((a: any) => ({
          id: a.id,
          group_id: a.group_id,
          display_group_code: a.eckcm_groups.display_group_code ?? "?",
          member_count: a.eckcm_groups.eckcm_group_memberships?.length ?? 0,
        }));

      fData.rooms.push({
        id: r.id,
        room_number: r.room_number,
        capacity: r.capacity,
        floor_id: r.floor_id,
        assignments,
        occupied: assignments.reduce((s, a) => s + a.member_count, 0),
      });
    }

    // Sort buildings by sort_order, floors by floor_number, rooms by room_number
    const sorted = Array.from(buildingMap.values()).sort((a, b) => a._sortOrder - b._sortOrder);
    for (const b of sorted) {
      b.floors.sort((a, c) => a.floor_number - c.floor_number);
      for (const f of b.floors) {
        f.rooms.sort((a, c) => a.room_number.localeCompare(c.room_number, undefined, { numeric: true }));
      }
    }

    setBuildings(sorted);
  }, [activeTab]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadGroups(), loadRooms()]);
    setLoading(false);
  }, [loadGroups, loadRooms]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Realtime updates
  const _timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedReload = useCallback(() => {
    if (_timer.current) clearTimeout(_timer.current);
    _timer.current = setTimeout(loadAll, 500);
  }, [loadAll]);

  useRealtime({ table: "eckcm_room_assignments", event: "*" }, debouncedReload);

  // ─── Assignment Actions ─────────────────────────────────────

  const assignGroupToRoom = useCallback(
    async (groupId: string, roomId: string) => {
      const supabase = createClient();

      const { error } = await supabase.from("eckcm_room_assignments").insert({
        group_id: groupId,
        room_id: roomId,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      await supabase
        .from("eckcm_groups")
        .update({ room_assign_status: "ASSIGNED" })
        .eq("id", groupId);

      toast.success("Room assigned");

      // Optimistic update for left panel
      setUnassigned((prev) => prev.filter((g) => g.id !== groupId));
      setAssignedCount((prev) => prev + 1);

      // Reload rooms to show updated assignments
      loadRooms();
    },
    [loadRooms]
  );

  const unassignGroup = useCallback(
    async (assignmentId: string, groupId: string) => {
      const supabase = createClient();

      const { error } = await supabase
        .from("eckcm_room_assignments")
        .delete()
        .eq("id", assignmentId);

      if (error) {
        toast.error(error.message);
        return;
      }

      await supabase
        .from("eckcm_groups")
        .update({ room_assign_status: "PENDING" })
        .eq("id", groupId);

      toast.success("Room unassigned");
      loadAll();
    },
    [loadAll]
  );

  // ─── Drag & Drop ────────────────────────────────────────────

  const activeGroup = useMemo(
    () => unassigned.find((g) => g.id === activeGroupId) ?? null,
    [unassigned, activeGroupId]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveGroupId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveGroupId(null);
    const { active, over } = event;
    if (!over) return;

    const groupId = active.id as string;
    const roomId = (over.id as string).replace("room-", "");

    if (roomId) {
      assignGroupToRoom(groupId, roomId);
    }
  };

  const handleDragCancel = () => {
    setActiveGroupId(null);
  };

  // ─── Quick Assign ───────────────────────────────────────────

  const allRooms = useMemo(() => {
    const result: { id: string; room_number: string; building: string }[] = [];
    for (const b of buildings) {
      for (const f of b.floors) {
        for (const r of f.rooms) {
          result.push({ id: r.id, room_number: r.room_number, building: b.name_en });
        }
      }
    }
    return result;
  }, [buildings]);

  const handleQuickAssign = () => {
    if (!quickGroup || !quickRoom) {
      toast.error("Select both a group and a room");
      return;
    }
    assignGroupToRoom(quickGroup, quickRoom);
    setQuickGroup("");
    setQuickRoom("");
  };

  // ─── Filtered Groups ───────────────────────────────────────

  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return unassigned;
    const q = groupSearch.toLowerCase();
    return unassigned.filter(
      (g) =>
        g.display_group_code.toLowerCase().includes(q) ||
        g.members.some(
          (m) =>
            m.first_name_en?.toLowerCase().includes(q) ||
            m.last_name_en?.toLowerCase().includes(q) ||
            m.display_name_ko?.toLowerCase().includes(q)
        ) ||
        g.church_name?.toLowerCase().includes(q)
    );
  }, [unassigned, groupSearch]);

  // ─── Room Search: auto-expand matching ──────────────────────

  useEffect(() => {
    if (!roomSearch.trim()) return;
    const q = roomSearch.toLowerCase();
    const newExpandedB = new Set<string>();
    const newExpandedF = new Set<string>();

    for (const b of buildings) {
      for (const f of b.floors) {
        for (const r of f.rooms) {
          if (r.room_number.toLowerCase().includes(q)) {
            newExpandedB.add(b.id);
            newExpandedF.add(f.id);
          }
        }
      }
    }

    if (newExpandedB.size > 0) {
      setExpandedBuildings(newExpandedB);
      setExpandedFloors(newExpandedF);
    }
  }, [roomSearch, buildings]);

  // ─── Building/Floor Toggle ──────────────────────────────────

  const toggleBuilding = (id: string) => {
    setExpandedBuildings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFloor = (id: string) => {
    setExpandedFloors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Building Stats ─────────────────────────────────────────

  const buildingStats = useCallback(
    (b: BuildingData) => {
      let totalCap = 0;
      let occupied = 0;
      let totalRooms = 0;
      for (const f of b.floors) {
        for (const r of f.rooms) {
          totalRooms++;
          totalCap += r.capacity;
          occupied += r.occupied;
        }
      }
      return { totalRooms, totalCap, occupied };
    },
    []
  );

  const floorStats = useCallback((f: FloorData) => {
    let totalCap = 0;
    let occupied = 0;
    for (const r of f.rooms) {
      totalCap += r.capacity;
      occupied += r.occupied;
    }
    return { totalRooms: f.rooms.length, totalCap, occupied };
  }, []);

  // ─── Render ─────────────────────────────────────────────────

  if (!feeCategories.length) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No lodging fee categories with inventory tracking found.
        <br />
        Configure them in Settings &gt; Fee Categories first.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-col h-full">
        {/* Event selector + Tabs */}
        <div className="shrink-0 border-b px-4 py-2 space-y-2">
          <div className="flex items-center gap-3">
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
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              {feeCategories.map((fc) => (
                <TabsTrigger key={fc.code} value={fc.code} className="text-xs">
                  {fc.name_en}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Main Content: Split Panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel — Unassigned Groups */}
          <div className="w-[340px] shrink-0 border-r flex flex-col">
            <div className="p-3 border-b space-y-2">
              <div className="text-sm font-medium">
                Unassigned ({filteredGroups.length})
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search groups..."
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {loading ? (
                <p className="text-center text-muted-foreground text-sm py-8">
                  Loading...
                </p>
              ) : filteredGroups.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">
                  {unassigned.length === 0
                    ? "All groups assigned!"
                    : "No matching groups."}
                </p>
              ) : (
                filteredGroups.map((group) => (
                  <DraggableGroupCard key={group.id} group={group} />
                ))
              )}
            </div>

            {/* Quick Assign */}
            <div className="p-3 border-t space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Quick Assign
              </div>
              <Select value={quickGroup} onValueChange={setQuickGroup}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  {unassigned.map((g) => (
                    <SelectItem key={g.id} value={g.id} className="text-xs">
                      {g.display_group_code} ({g.member_count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={quickRoom} onValueChange={setQuickRoom}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {allRooms.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">
                      {r.room_number} — {r.building}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="w-full h-7 text-xs"
                onClick={handleQuickAssign}
                disabled={!quickGroup || !quickRoom}
              >
                Assign
              </Button>
            </div>
          </div>

          {/* Right Panel — Rooms */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search rooms..."
                  value={roomSearch}
                  onChange={(e) => setRoomSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="empty-only"
                  checked={showEmptyOnly}
                  onCheckedChange={setShowEmptyOnly}
                />
                <Label htmlFor="empty-only" className="text-xs whitespace-nowrap">
                  Empty only
                </Label>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {loading ? (
                <p className="text-center text-muted-foreground text-sm py-8">
                  Loading...
                </p>
              ) : buildings.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">
                  No rooms found for this category. Configure rooms in Settings
                  &gt; Lodging.
                </p>
              ) : (
                buildings.map((building) => {
                  const stats = buildingStats(building);
                  return (
                    <div key={building.id} className="border rounded-lg">
                      <button
                        className="w-full flex items-center gap-2 p-2.5 hover:bg-muted/50 text-left"
                        onClick={() => toggleBuilding(building.id)}
                      >
                        <ChevronRight
                          className={cn(
                            "size-4 text-muted-foreground transition-transform",
                            expandedBuildings.has(building.id) && "rotate-90"
                          )}
                        />
                        <Building2 className="size-4 text-muted-foreground" />
                        <span className="font-medium text-sm">
                          {building.name_en}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {stats.occupied}/{stats.totalCap} occupied
                        </span>
                      </button>

                      {expandedBuildings.has(building.id) && (
                        <div className="border-t">
                          {building.floors.map((floor) => {
                            const fStats = floorStats(floor);
                            const filteredRooms = floor.rooms.filter((r) => {
                              if (showEmptyOnly && r.occupied > 0) return false;
                              if (
                                roomSearch.trim() &&
                                !r.room_number
                                  .toLowerCase()
                                  .includes(roomSearch.toLowerCase())
                              )
                                return false;
                              return true;
                            });

                            if (filteredRooms.length === 0 && (showEmptyOnly || roomSearch.trim()))
                              return null;

                            return (
                              <div key={floor.id}>
                                <button
                                  className="w-full flex items-center gap-2 px-4 py-2 hover:bg-muted/30 text-left border-b"
                                  onClick={() => toggleFloor(floor.id)}
                                >
                                  <ChevronRight
                                    className={cn(
                                      "size-3.5 text-muted-foreground transition-transform",
                                      expandedFloors.has(floor.id) && "rotate-90"
                                    )}
                                  />
                                  <Layers className="size-3.5 text-muted-foreground" />
                                  <span className="text-sm">
                                    {floor.name_en || `Floor ${floor.floor_number}`}
                                  </span>
                                  <span className="text-xs text-muted-foreground ml-auto">
                                    {fStats.occupied}/{fStats.totalCap}
                                  </span>
                                </button>

                                {expandedFloors.has(floor.id) && (
                                  <div className="divide-y">
                                    {filteredRooms.map((room) => (
                                      <DroppableRoomRow
                                        key={room.id}
                                        room={room}
                                        onUnassign={unassignGroup}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Summary Bar */}
        <div className="shrink-0 border-t px-4 py-2 flex items-center gap-4 text-sm text-muted-foreground bg-muted/30">
          <span>
            <strong className="text-foreground">{totalGroups}</strong> groups
          </span>
          <span>
            <strong className="text-foreground">{assignedCount}</strong> assigned
          </span>
          <span>
            <strong className="text-foreground">
              {totalGroups - assignedCount}
            </strong>{" "}
            unassigned
          </span>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeGroup ? (
          <div className="w-[300px]">
            <GroupCardContent group={activeGroup} isDragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Draggable Group Card ─────────────────────────────────────

function DraggableGroupCard({ group }: { group: UnassignedGroup }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: group.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(isDragging && "opacity-30")}
    >
      <GroupCardContent group={group} />
    </div>
  );
}

function GroupCardContent({
  group,
  isDragging,
}: {
  group: UnassignedGroup;
  isDragging?: boolean;
}) {
  const memberNames = group.members
    .map((m) => m.display_name_ko || `${m.first_name_en} ${m.last_name_en}`)
    .join(", ");

  return (
    <Card
      className={cn(
        "cursor-grab active:cursor-grabbing select-none",
        isDragging && "shadow-lg ring-2 ring-primary"
      )}
    >
      <CardContent className="p-3 space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <GripVertical className="size-3.5 text-muted-foreground" />
            <span className="font-mono text-xs font-medium">
              {group.display_group_code}
            </span>
          </div>
          <Badge variant="secondary" className="text-[10px] gap-0.5">
            <Users className="size-2.5" />
            {group.member_count}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {memberNames || "No members"}
        </div>
        {group.church_name && (
          <div className="text-[10px] text-muted-foreground/70 truncate">
            {group.church_name}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Droppable Room Row ───────────────────────────────────────

function DroppableRoomRow({
  room,
  onUnassign,
}: {
  room: RoomData;
  onUnassign: (assignmentId: string, groupId: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `room-${room.id}`,
  });

  const isEmpty = room.occupied === 0;
  const isFull = room.occupied >= room.capacity;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-2 px-6 py-1.5 min-h-[36px] text-sm transition-colors",
        isOver && !isFull && "bg-primary/10 ring-1 ring-primary ring-inset",
        isOver && isFull && "bg-destructive/10"
      )}
    >
      <span className="font-mono text-xs w-12 shrink-0">{room.room_number}</span>
      <span className="text-xs text-muted-foreground w-10 shrink-0">
        ({room.capacity}p)
      </span>
      <span
        className={cn(
          "text-xs w-10 shrink-0",
          isEmpty
            ? "text-muted-foreground"
            : isFull
              ? "text-orange-600 dark:text-orange-400 font-medium"
              : "text-foreground"
        )}
      >
        {room.occupied}/{room.capacity}
      </span>
      <div className="flex-1 flex flex-wrap gap-1 min-w-0">
        {room.assignments.map((a) => (
          <Badge
            key={a.id}
            variant="outline"
            className="text-[10px] font-mono gap-0.5 pr-0.5"
          >
            {a.display_group_code}
            <button
              className="ml-0.5 p-0.5 hover:bg-muted rounded"
              onClick={(e) => {
                e.stopPropagation();
                onUnassign(a.id, a.group_id);
              }}
            >
              <X className="size-2.5" />
            </button>
          </Badge>
        ))}
        {isEmpty && (
          <span className="text-[10px] text-muted-foreground/50 italic">
            empty
          </span>
        )}
      </div>
    </div>
  );
}
