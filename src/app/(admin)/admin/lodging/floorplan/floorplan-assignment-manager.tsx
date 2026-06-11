"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  BedDouble,
  Building2,
  Check,
  CircleSlash,
  DoorOpen,
  Loader2,
  Map as MapIcon,
  RefreshCw,
  Search,
  UserPlus,
  Users,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Willow Hall (WLW) is managed on its own dedicated page, so it is intentionally
// excluded here.
const BUILDING_ORDER = ["LLC", "MAP", "OAK"];
const ACTIVE_STATUSES = ["SUBMITTED", "APPROVED", "PAID"];

interface EventOption {
  id: string;
  name_en: string;
  year: number;
}

interface Participant {
  firstName: string;
  lastName: string;
  displayNameKo: string | null;
  arrival: string | null;
  departure: string | null;
}

interface RoomAssignment {
  assignmentId: string;
  groupId: string;
  groupCode: string;
  registrationId: string;
  confirmationCode: string;
  notes: string | null;
  additionalRequests: string | null;
  participants: Participant[];
}

interface Room {
  dbRoomId: string;
  roomNumber: string;
  building: string;
  buildingCode: string;
  floor: number;
  floorName: string;
  type: string;
  capacity: number;
  hostCapacity: number;
  eventCapacity: number;
  hasAc: boolean;
  isAccessible: boolean;
  isAvailable: boolean;
  lodgingCategory: string;
  lodgingCategoryName: string;
  note: string;
  participants: Participant[];
  assignments?: RoomAssignment[];
}

interface GroupMember {
  firstName: string;
  lastName: string;
  displayNameKo: string | null;
  churchName: string | null;
}

interface RegistrationGroup {
  id: string;
  registrationId: string;
  confirmationCode: string;
  displayGroupCode: string;
  lodgingType: string | null;
  roomAssignStatus: string;
  memberCount: number;
  members: GroupMember[];
  churchName: string | null;
  preferences: Record<string, unknown>;
  notes: string | null;
  additionalRequests: string | null;
  assignedRoomId: string | null;
  assignedRoomNumber: string | null;
}

export function FloorplanAssignmentManager({ events }: { events: EventOption[] }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [groups, setGroups] = useState<RegistrationGroup[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [selectedBuildingCode, setSelectedBuildingCode] = useState("LLC");
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [eventId, setEventId] = useState(events[0]?.id ?? "");

  const loadRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const res = await fetch("/api/admin/lodging/upj-rooms");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load rooms");
      setRooms(data.rooms ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load rooms");
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  const loadGroups = useCallback(async () => {
    if (!eventId) {
      setGroups([]);
      return;
    }

    setLoadingGroups(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("eckcm_groups")
      .select(`
        id,
        display_group_code,
        lodging_type,
        room_assign_status,
        preferences,
        eckcm_registrations!inner(id, confirmation_code, status, notes, additional_requests),
        eckcm_group_memberships(
          eckcm_people(
            first_name_en,
            last_name_en,
            display_name_ko,
            church_other,
            eckcm_churches(name_en)
          )
        ),
        eckcm_room_assignments(id, room_id, eckcm_rooms(room_number))
      `)
      .eq("event_id", eventId)
      .in("eckcm_registrations.status", ACTIVE_STATUSES)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error(error.message);
      setLoadingGroups(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((data ?? []) as any[]).map<RegistrationGroup>((group) => {
      const registration = firstOf(group.eckcm_registrations);
      const memberships = (group.eckcm_group_memberships ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((membership: any) => membership.eckcm_people);

      const members: GroupMember[] = memberships.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (membership: any) => {
          const person = membership.eckcm_people;
          return {
            firstName: person.first_name_en ?? "",
            lastName: person.last_name_en ?? "",
            displayNameKo: person.display_name_ko ?? null,
            churchName: person.church_other || person.eckcm_churches?.name_en || null,
          };
        },
      );

      const assignment = firstOf(group.eckcm_room_assignments);

      return {
        id: group.id,
        registrationId: registration?.id ?? "",
        confirmationCode: registration?.confirmation_code ?? "",
        displayGroupCode: group.display_group_code ?? "",
        lodgingType: group.lodging_type ?? null,
        roomAssignStatus: group.room_assign_status ?? "PENDING",
        memberCount: members.length,
        members,
        churchName: members.find((member) => member.churchName)?.churchName ?? null,
        preferences: group.preferences ?? {},
        notes: registration?.notes ?? null,
        additionalRequests: registration?.additional_requests ?? null,
        assignedRoomId: assignment?.room_id ?? null,
        assignedRoomNumber: assignment?.eckcm_rooms?.room_number ?? null,
      };
    });

    setGroups(rows);
    setLoadingGroups(false);
  }, [eventId]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const buildings = useMemo(() => {
    const map = new Map<string, { code: string; name: string; totalRooms: number }>();
    for (const room of rooms) {
      // Willow Hall has its own dedicated page — keep it off the floorplan tabs.
      if (room.buildingCode === "WLW") continue;
      const existing = map.get(room.buildingCode);
      map.set(room.buildingCode, {
        code: room.buildingCode,
        name: room.building,
        totalRooms: (existing?.totalRooms ?? 0) + 1,
      });
    }
    return Array.from(map.values()).sort(
      (a, b) => BUILDING_ORDER.indexOf(a.code) - BUILDING_ORDER.indexOf(b.code),
    );
  }, [rooms]);

  useEffect(() => {
    if (!buildings.length) return;
    if (!buildings.some((building) => building.code === selectedBuildingCode)) {
      setSelectedBuildingCode(buildings[0].code);
    }
  }, [buildings, selectedBuildingCode]);

  const floors = useMemo(() => {
    const values = new Set<number>();
    for (const room of rooms) {
      if (room.buildingCode === selectedBuildingCode) values.add(room.floor);
    }
    return Array.from(values).sort((a, b) => a - b);
  }, [rooms, selectedBuildingCode]);

  useEffect(() => {
    if (!floors.length) {
      setSelectedFloor(null);
      return;
    }
    if (selectedFloor === null || !floors.includes(selectedFloor)) {
      setSelectedFloor(floors[0]);
    }
  }, [floors, selectedFloor]);

  const selectedBuilding = buildings.find((building) => building.code === selectedBuildingCode) ?? null;
  const visibleRooms = useMemo(
    () =>
      rooms
        .filter((room) => room.buildingCode === selectedBuildingCode)
        .filter((room) => selectedFloor === null || room.floor === selectedFloor)
        .sort(compareRooms),
    [rooms, selectedBuildingCode, selectedFloor],
  );

  const selectedRoom = rooms.find((room) => room.dbRoomId === selectedRoomId) ?? null;
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;

  useEffect(() => {
    if (selectedRoomId && !rooms.some((room) => room.dbRoomId === selectedRoomId)) {
      setSelectedRoomId(null);
    }
  }, [rooms, selectedRoomId]);

  useEffect(() => {
    setSelectedGroupId("");
  }, [selectedRoomId]);

  const selectableGroups = useMemo(() => {
    return groups
      .sort((a, b) => {
        const aAssigned = a.assignedRoomId ? 1 : 0;
        const bAssigned = b.assignedRoomId ? 1 : 0;
        if (aAssigned !== bAssigned) return aAssigned - bAssigned;
        return groupLabel(a).localeCompare(groupLabel(b), undefined, { numeric: true });
      });
  }, [groups]);

  const selectedRoomOccupancy = selectedRoom?.participants.length ?? 0;
  const selectedGroupAlreadyInRoom =
    !!selectedRoom && !!selectedGroup && selectedGroup.assignedRoomId === selectedRoom.dbRoomId;
  const selectedGroupWouldExceed =
    !!selectedRoom &&
    !!selectedGroup &&
    !selectedGroupAlreadyInRoom &&
    selectedRoomOccupancy + selectedGroup.memberCount > selectedRoom.eventCapacity;

  const handleAssign = async () => {
    if (!selectedRoom || !selectedGroup) return;
    setAssigning(true);

    try {
      const res = await fetch(`/api/admin/registrations/${selectedGroup.registrationId}/room`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: selectedGroup.id, roomId: selectedRoom.dbRoomId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to assign room");

      toast.success(`${selectedGroup.displayGroupCode} assigned to ${selectedRoom.roomNumber}`);
      setSelectedGroupId("");
      await Promise.all([loadRooms(), loadGroups()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assign room");
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (assignment: RoomAssignment) => {
    setAssigning(true);
    try {
      const res = await fetch(`/api/admin/registrations/${assignment.registrationId}/room`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: assignment.groupId, roomId: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to unassign room");

      toast.success(`${assignment.groupCode} unassigned`);
      await Promise.all([loadRooms(), loadGroups()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unassign room");
    } finally {
      setAssigning(false);
    }
  };

  const stats = useMemo(() => {
    const buildingRooms = rooms.filter((room) => room.buildingCode === selectedBuildingCode);
    return {
      total: buildingRooms.length,
      assigned: buildingRooms.filter((room) => room.participants.length > 0).length,
      people: buildingRooms.reduce((sum, room) => sum + room.participants.length, 0),
      available: buildingRooms.filter((room) => room.isAvailable).length,
    };
  }, [rooms, selectedBuildingCode]);

  if (!events.length) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No events found. Create an event before assigning rooms.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={eventId} onValueChange={setEventId}>
            <SelectTrigger className="h-9 w-[230px]">
              <SelectValue placeholder="Select event" />
            </SelectTrigger>
            <SelectContent>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.name_en} ({event.year})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex flex-wrap gap-1.5">
            {buildings.map((building) => (
              <Button
                key={building.code}
                type="button"
                variant={building.code === selectedBuildingCode ? "default" : "outline"}
                size="sm"
                className="h-9 gap-1.5"
                onClick={() => {
                  setSelectedBuildingCode(building.code);
                  setSelectedRoomId(null);
                }}
              >
                <Building2 className="size-3.5" />
                {building.name}
              </Button>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto h-9 gap-1.5"
            onClick={() => Promise.all([loadRooms(), loadGroups()])}
            disabled={loadingRooms || loadingGroups}
          >
            <RefreshCw className={cn("size-3.5", (loadingRooms || loadingGroups) && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select
            value={selectedFloor === null ? "" : String(selectedFloor)}
            onValueChange={(value) => {
              setSelectedFloor(Number(value));
              setSelectedRoomId(null);
            }}
            disabled={!floors.length}
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="Floor" />
            </SelectTrigger>
            <SelectContent>
              {floors.map((floor) => (
                <SelectItem key={floor} value={String(floor)}>
                  Floor {floor}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">{stats.total}</strong> rooms
          </span>
          <span>
            <strong className="text-foreground">{stats.available}</strong> available
          </span>
          <span>
            <strong className="text-foreground">{stats.assigned}</strong> assigned
          </span>
          <span>
            <strong className="text-foreground">{stats.people}</strong> people
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_380px]">
        <main className="min-h-0 overflow-auto bg-muted/20 p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {selectedBuilding?.name ?? "Floor Plan"}
                {selectedFloor !== null ? ` - Floor ${selectedFloor}` : ""}
              </h2>
              <p className="text-xs text-muted-foreground">
                Rooms are rendered from the current UPJ lodging room inventory.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/admin/lodging/upj-rooms">
                <BedDouble className="size-3.5" />
                UPJ rooms
              </Link>
            </Button>
          </div>

          {loadingRooms ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-lg border bg-background">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : rooms.length === 0 ? (
            <EmptyRoomsState />
          ) : selectedBuildingCode === "OAK" || selectedBuildingCode === "MAP" ? (
            <OakMapleFloorPlan
              rooms={visibleRooms}
              floor={selectedFloor ?? 1}
              buildingName={selectedBuilding?.name ?? (selectedBuildingCode === "MAP" ? "Maple Hall" : "Oak Hall")}
              selectedRoomId={selectedRoomId}
              onSelectRoom={setSelectedRoomId}
            />
          ) : (
            <SchematicFloorPlan
              rooms={visibleRooms}
              buildingCode={selectedBuildingCode}
              selectedRoomId={selectedRoomId}
              onSelectRoom={setSelectedRoomId}
            />
          )}
        </main>

        <aside className="min-h-0 overflow-y-auto border-l bg-background p-4">
          <AssignmentPanel
            selectedRoom={selectedRoom}
            groups={selectableGroups}
            selectedGroupId={selectedGroupId}
            onSelectedGroupChange={setSelectedGroupId}
            selectedGroup={selectedGroup}
            loadingGroups={loadingGroups}
            assigning={assigning}
            selectedGroupAlreadyInRoom={selectedGroupAlreadyInRoom}
            selectedGroupWouldExceed={selectedGroupWouldExceed}
            onAssign={handleAssign}
            onUnassign={handleUnassign}
          />
        </aside>
      </div>
    </div>
  );
}

function EmptyRoomsState() {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border bg-background p-6 text-center">
      <CircleSlash className="mb-3 size-8 text-muted-foreground" />
      <p className="text-sm font-medium">No UPJ rooms found.</p>
      <p className="mt-1 max-w-md text-xs text-muted-foreground">
        Import rooms from the UPJ Excel files before using the floorplan assignment view.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-4">
        <Link href="/admin/lodging/upj-rooms">Go to UPJ lodging rooms</Link>
      </Button>
    </div>
  );
}

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;

function SchematicFloorPlan({
  rooms,
  buildingCode,
  selectedRoomId,
  onSelectRoom,
}: {
  rooms: Room[];
  buildingCode: string;
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
}) {
  const sections = useMemo(() => buildSections(rooms, buildingCode), [rooms, buildingCode]);
  const [zoom, setZoom] = useState(1);
  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, Number((z + ZOOM_STEP).toFixed(2))));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, Number((z - ZOOM_STEP).toFixed(2))));
  const zoomReset = () => setZoom(1);
  const isLLC = buildingCode === "LLC";
  const roomWidth = isLLC ? 76 : 72;
  const roomHeight = isLLC ? 78 : 70;
  const gap = isLLC ? 6 : 6;
  const sectionGap = isLLC ? 36 : 28;
  const lobbyWidth = isLLC ? 130 : 110;
  const leftPad = 32;
  const topY = isLLC ? 96 : 86;
  const bottomY = isLLC ? 200 : 176;
  const frameTopY = 64;
  const frameHeight = isLLC ? 234 : 200;
  const hallY = isLLC ? 178 : 158;
  const hallHeight = isLLC ? 18 : 16;
  const lobbyInsertIndex = Math.floor(sections.length / 2);

  let cursorX = leftPad;
  const sectionLayouts = sections.map((section, index) => {
    const columns = Math.max(section.top.length, section.bottom.length, 1);
    const width = columns * roomWidth + (columns - 1) * gap;
    const layout = { ...section, x: cursorX, width };
    cursorX += width + sectionGap;
    if (index + 1 === lobbyInsertIndex) {
      cursorX += lobbyWidth + sectionGap;
    }
    return layout;
  });

  let lobbyX = leftPad;
  if (sectionLayouts.length > 0 && lobbyInsertIndex > 0 && lobbyInsertIndex < sectionLayouts.length) {
    const prev = sectionLayouts[lobbyInsertIndex - 1];
    lobbyX = prev.x + prev.width + sectionGap;
  } else if (sectionLayouts.length > 0) {
    lobbyX = sectionLayouts[sectionLayouts.length - 1].x + sectionLayouts[sectionLayouts.length - 1].width + sectionGap;
  }

  const totalRight = sectionLayouts.length
    ? sectionLayouts[sectionLayouts.length - 1].x + sectionLayouts[sectionLayouts.length - 1].width
    : leftPad;
  const svgWidth = Math.max(960, totalRight + leftPad);
  const svgHeight = isLLC ? 320 : 290;

  if (!rooms.length) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-lg border bg-background text-sm text-muted-foreground">
        No rooms for this floor.
      </div>
    );
  }

  return (
    <div className="rounded-none border bg-white shadow-sm">
      <div className="flex items-center justify-end gap-1 border-b bg-background/95 p-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={zoomOut}
          disabled={zoom <= ZOOM_MIN}
          aria-label="Zoom out"
        >
          <ZoomOut className="size-3.5" />
        </Button>
        <span className="min-w-[40px] text-center text-xs font-medium tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={zoomIn}
          disabled={zoom >= ZOOM_MAX}
          aria-label="Zoom in"
        >
          <ZoomIn className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={zoomReset}
          disabled={zoom === 1}
          aria-label="Reset zoom"
        >
          <Maximize2 className="size-3.5" />
        </Button>
      </div>
      <div className="overflow-auto rounded-none">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`${buildingCode} floor plan`}
        style={{
          display: "block",
          width: `${svgWidth * zoom}px`,
          maxWidth: "none",
          height: "auto",
        }}
      >
        <defs>
          <style>{`
            .fp-title { font: 800 18px system-ui, -apple-system, "Segoe UI", sans-serif; fill:#0f172a; }
            .fp-muted { font: 700 11px system-ui, -apple-system, "Segoe UI", sans-serif; fill:#64748b; }
            .fp-frame { fill:#ffffff; stroke:#e2e8f0; stroke-width:1.2; }
            .fp-hall { fill:#f8fafc; stroke:#cbd5e1; stroke-width:1.5; }
            .fp-room rect { fill:#f8fafc; stroke:#64748b; stroke-width:2; transition: fill .15s, stroke .15s; }
            .fp-room:hover rect { fill:#e0f2fe; stroke:#0284c7; }
            .fp-room.selected rect { fill:#bfdbfe; stroke:#2563eb; stroke-width:3; }
            .fp-room.assigned rect { fill:#e5e7eb; stroke:#64748b; }
            .fp-room.full rect { fill:#dbeafe; stroke:#2563eb; }
            .fp-room.ada rect { fill:#ecfeff; stroke:#0891b2; }
            .fp-room.apartment rect { fill:#f5f3ff; stroke:#7c3aed; }
            .fp-room.unavailable rect { fill:#fee2e2; stroke:#dc2626; stroke-dasharray:7 4; }
            .fp-room text { pointer-events:none; fill:#111827; text-anchor:middle; dominant-baseline:middle; }
            .fp-room .num { font: 850 ${isLLC ? 17 : 16}px system-ui, -apple-system, "Segoe UI", sans-serif; }
            .fp-room .sub { font: 700 ${isLLC ? 11 : 10}px system-ui, -apple-system, "Segoe UI", sans-serif; fill:#64748b; }
            .fp-lobby rect { fill:#eff6ff; stroke:#2563eb; stroke-width:1.6; }
            .fp-lobby text { font: 800 12px system-ui, -apple-system, "Segoe UI", sans-serif; fill:#1e3a8a; text-anchor:middle; dominant-baseline:middle; }
            .fp-placeholder { pointer-events:none; }
            .fp-placeholder rect { fill:repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9 4px,#e2e8f0 4px,#e2e8f0 8px); fill:#f1f5f9; stroke:#cbd5e1; stroke-width:1.5; stroke-dasharray:5 4; }
            .fp-placeholder text { font: 700 ${isLLC ? 15 : 14}px system-ui, -apple-system, "Segoe UI", sans-serif; fill:#94a3b8; text-anchor:middle; dominant-baseline:middle; text-decoration: line-through; }
          `}</style>
        </defs>

        <text x={leftPad} y="34" className="fp-title">
          {buildingCode} Floor Plan
        </text>
        <text x={leftPad} y="54" className="fp-muted">
          Click a room, then select a registration group on the right.
        </text>

        {sectionLayouts.map((section) => (
          <g key={`section-${section.x}`}>
            <rect
              x={section.x - 8}
              y={frameTopY}
              width={section.width + 16}
              height={frameHeight}
              rx={10}
              className="fp-frame"
            />
            <rect
              x={section.x}
              y={hallY}
              width={section.width}
              height={hallHeight}
              rx={hallHeight / 2}
              className="fp-hall"
            />
            {section.top.map((cell, index) => (
              <CellTile
                key={cell.kind === "room" ? cell.room.dbRoomId : `ph-top-${index}-${cell.label}`}
                cell={cell}
                x={section.x + index * (roomWidth + gap)}
                y={topY}
                width={roomWidth}
                height={roomHeight}
                selectedRoomId={selectedRoomId}
                onSelect={onSelectRoom}
              />
            ))}
            {section.bottom.map((cell, index) => (
              <CellTile
                key={cell.kind === "room" ? cell.room.dbRoomId : `ph-bot-${index}-${cell.label}`}
                cell={cell}
                x={section.x + index * (roomWidth + gap)}
                y={bottomY}
                width={roomWidth}
                height={roomHeight}
                selectedRoomId={selectedRoomId}
                onSelect={onSelectRoom}
              />
            ))}
          </g>
        ))}

        {sectionLayouts.length > 1 ? (
          <g className="fp-lobby">
            <rect
              x={lobbyX - 8}
              y={frameTopY}
              width={lobbyWidth + 16}
              height={frameHeight}
              rx={10}
            />
            <text x={lobbyX + lobbyWidth / 2} y={frameTopY + frameHeight / 2}>
              Main Lobby
            </text>
          </g>
        ) : null}
      </svg>
      </div>
    </div>
  );
}

// ─── Oak/Maple Hall photo-accurate floor plan ───────────────────
// Oak Hall and Maple Hall are identical twin buildings: their floor-plan
// sheets (public/upj-lodging/Oak-FloorPlan.xlsx & Maple-FloorPlan.xlsx) and
// room inventories share the exact same offsets (entrance 0–7, center 16–26,
// apartment 30–37; floor 1 has no offset 33). This one template serves both
// buildings and both floors (1xx / 2xx). Keys are the 2-digit room offset
// (roomNumber % 100). Room metadata + occupancy come from the live inventory.
const OAK_TILE_W = 74;
const OAK_TILE_H = 64;
const OAK_VIEW_W = 968;
const OAK_VIEW_H = 724;

interface OakSlot {
  x: number;
  y: number;
}

const OAK_LAYOUT: Record<number, OakSlot> = {
  // Center wing (top, vertical): tall column rising above the lobby
  // Left column (even, top→bottom)
  26: { x: 407, y: 80 }, 24: { x: 407, y: 150 }, 22: { x: 407, y: 220 },
  20: { x: 407, y: 290 }, 18: { x: 407, y: 360 }, 16: { x: 407, y: 430 },
  // Right column (odd, top→bottom); stairs sit above 25
  25: { x: 487, y: 150 }, 23: { x: 487, y: 220 }, 21: { x: 487, y: 290 },
  19: { x: 487, y: 360 }, 17: { x: 487, y: 430 },
  // Entrance wing (bottom-left row): top row 7/5/3/1, bottom row 6/4/2/0
  7: { x: 37, y: 550 }, 5: { x: 117, y: 550 }, 3: { x: 197, y: 550 }, 1: { x: 277, y: 550 },
  6: { x: 37, y: 620 }, 4: { x: 117, y: 620 }, 2: { x: 197, y: 620 }, 0: { x: 277, y: 620 },
  // Apartment wing (bottom-right row): top row 30/32/34/36, bottom row 31/33/35/37
  30: { x: 617, y: 550 }, 32: { x: 697, y: 550 }, 34: { x: 777, y: 550 }, 36: { x: 857, y: 550 },
  31: { x: 617, y: 620 }, 33: { x: 697, y: 620 }, 35: { x: 777, y: 620 }, 37: { x: 857, y: 620 },
};

const OAK_STAIRS: OakSlot = { x: 487, y: 80 };

function OakMapleFloorPlan({
  rooms,
  floor,
  buildingName,
  selectedRoomId,
  onSelectRoom,
}: {
  rooms: Room[];
  floor: number;
  buildingName: string;
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, Number((z + ZOOM_STEP).toFixed(2))));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, Number((z - ZOOM_STEP).toFixed(2))));
  const zoomReset = () => setZoom(1);

  const { placed, overflow } = useMemo(() => {
    const placed: { room: Room; slot: OakSlot }[] = [];
    const overflow: Room[] = [];
    const used = new Set<number>();
    for (const room of rooms) {
      const offset = numericRoomNumber(room) % 100;
      const slot = OAK_LAYOUT[offset];
      if (slot && !used.has(offset)) {
        used.add(offset);
        placed.push({ room, slot });
      } else {
        overflow.push(room);
      }
    }
    return { placed, overflow };
  }, [rooms]);

  if (!rooms.length) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-lg border bg-background text-sm text-muted-foreground">
        No {buildingName} rooms for this floor.
      </div>
    );
  }

  return (
    <div className="rounded-none border bg-white shadow-sm">
      <div className="flex items-center justify-end gap-1 border-b bg-background/95 p-1">
        <Button type="button" variant="ghost" size="icon" className="size-7" onClick={zoomOut} disabled={zoom <= ZOOM_MIN} aria-label="Zoom out">
          <ZoomOut className="size-3.5" />
        </Button>
        <span className="min-w-[40px] text-center text-xs font-medium tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button type="button" variant="ghost" size="icon" className="size-7" onClick={zoomIn} disabled={zoom >= ZOOM_MAX} aria-label="Zoom in">
          <ZoomIn className="size-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-7" onClick={zoomReset} disabled={zoom === 1} aria-label="Reset zoom">
          <Maximize2 className="size-3.5" />
        </Button>
      </div>
      <style>{`
        .oak-scroll::-webkit-scrollbar { width: 14px; height: 14px; }
        .oak-scroll::-webkit-scrollbar-track { background: #f1f5f9; }
        .oak-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 7px; border: 3px solid #f1f5f9; }
        .oak-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .oak-scroll::-webkit-scrollbar-corner { background: #f1f5f9; }
      `}</style>
      <div className="oak-scroll overflow-scroll max-h-[70vh]">
        <svg
          viewBox={`0 0 ${OAK_VIEW_W} ${OAK_VIEW_H + (overflow.length ? 96 : 0)}`}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label={`${buildingName} floor ${floor} plan`}
          style={{ display: "block", width: `${OAK_VIEW_W * zoom}px`, maxWidth: "none", height: "auto" }}
        >
          <defs>
            <style>{`
              .fp-title { font: 800 18px system-ui, -apple-system, "Segoe UI", sans-serif; fill:#0f172a; }
              .fp-muted { font: 700 11px system-ui, -apple-system, "Segoe UI", sans-serif; fill:#64748b; }
              .fp-frame { fill:#ffffff; stroke:#e2e8f0; stroke-width:1.2; }
              .fp-lobby rect { fill:#eff6ff; stroke:#2563eb; stroke-width:1.6; }
              .fp-lobby text { font: 800 13px system-ui, -apple-system, "Segoe UI", sans-serif; fill:#1e3a8a; text-anchor:middle; dominant-baseline:middle; }
              .fp-stairs rect { fill:#f1f5f9; stroke:#94a3b8; stroke-width:1.5; stroke-dasharray:5 4; }
              .fp-stairs text { font: 700 12px system-ui, -apple-system, "Segoe UI", sans-serif; fill:#64748b; text-anchor:middle; dominant-baseline:middle; }
              .fp-room rect { fill:#f8fafc; stroke:#64748b; stroke-width:2; transition: fill .15s, stroke .15s; }
              .fp-room:hover rect { fill:#e0f2fe; stroke:#0284c7; }
              .fp-room.selected rect { fill:#bfdbfe; stroke:#2563eb; stroke-width:3; }
              .fp-room.assigned rect { fill:#e5e7eb; stroke:#64748b; }
              .fp-room.full rect { fill:#dbeafe; stroke:#2563eb; }
              .fp-room.ada rect { fill:#ecfeff; stroke:#0891b2; }
              .fp-room.apartment rect { fill:#f5f3ff; stroke:#7c3aed; }
              .fp-room.unavailable rect { fill:#fee2e2; stroke:#dc2626; stroke-dasharray:7 4; }
              .fp-room text { pointer-events:none; fill:#111827; text-anchor:middle; dominant-baseline:middle; }
              .fp-room .num { font: 850 16px system-ui, -apple-system, "Segoe UI", sans-serif; }
              .fp-room .sub { font: 700 10px system-ui, -apple-system, "Segoe UI", sans-serif; fill:#64748b; }
            `}</style>
          </defs>

          <text x="24" y="34" className="fp-title">{buildingName} — Floor {floor}</text>
          <text x="24" y="54" className="fp-muted">Click a room, then select a registration group on the right.</text>

          {/* Center wing — tall vertical column up top */}
          <rect x="391" y="64" width="186" height="446" rx="10" className="fp-frame" />

          {/* Bottom row — entrance wing | Main Lobby | apartment wing, even 24px gaps */}
          <rect x="21" y="534" width="346" height="166" rx="10" className="fp-frame" />
          <rect x="601" y="534" width="346" height="166" rx="10" className="fp-frame" />
          <g className="fp-lobby" aria-hidden="true">
            <rect x="391" y="534" width="186" height="166" rx="10" />
            <text x="484" y="617">Main Lobby</text>
          </g>

          {/* Stairs marker (top of center wing) */}
          <g className="fp-stairs" aria-hidden="true">
            <rect x={OAK_STAIRS.x} y={OAK_STAIRS.y} width={OAK_TILE_W} height={OAK_TILE_H} rx="8" />
            <text x={OAK_STAIRS.x + OAK_TILE_W / 2} y={OAK_STAIRS.y + OAK_TILE_H / 2}>Stairs</text>
          </g>

          {/* Rooms */}
          {placed.map(({ room, slot }) => (
            <RoomSvgTile
              key={room.dbRoomId}
              room={room}
              x={slot.x}
              y={slot.y}
              width={OAK_TILE_W}
              height={OAK_TILE_H}
              selected={room.dbRoomId === selectedRoomId}
              onSelect={onSelectRoom}
            />
          ))}

          {/* Any rooms not in the template (defensive) render in an overflow row */}
          {overflow.length ? (
            <>
              <text x="24" y={OAK_VIEW_H + 30} className="fp-muted">
                Other rooms
              </text>
              {overflow.map((room, index) => (
                <RoomSvgTile
                  key={room.dbRoomId}
                  room={room}
                  x={24 + index * (OAK_TILE_W + 6)}
                  y={OAK_VIEW_H + 40}
                  width={OAK_TILE_W}
                  height={OAK_TILE_H}
                  selected={room.dbRoomId === selectedRoomId}
                  onSelect={onSelectRoom}
                />
              ))}
            </>
          ) : null}
        </svg>
      </div>
    </div>
  );
}

function CellTile({
  cell,
  x,
  y,
  width,
  height,
  selectedRoomId,
  onSelect,
}: {
  cell: Cell;
  x: number;
  y: number;
  width: number;
  height: number;
  selectedRoomId: string | null;
  onSelect: (roomId: string) => void;
}) {
  if (cell.kind === "placeholder") {
    return (
      <g className="fp-placeholder" transform={`translate(${x},${y})`} aria-hidden="true">
        <rect width={width} height={height} rx="8" />
        <text className="num" x={width / 2} y={height / 2}>
          {cell.label}
        </text>
      </g>
    );
  }
  const room = cell.room;
  return (
    <RoomSvgTile
      room={room}
      x={x}
      y={y}
      width={width}
      height={height}
      selected={room.dbRoomId === selectedRoomId}
      onSelect={onSelect}
    />
  );
}

function RoomSvgTile({
  room,
  x,
  y,
  width,
  height,
  selected,
  onSelect,
}: {
  room: Room;
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
  onSelect: (roomId: string) => void;
}) {
  const className = cn(
    "fp-room",
    room.participants.length > 0 && "assigned",
    room.participants.length >= room.eventCapacity && "full",
    (room.isAccessible || /ada/i.test(room.note)) && "ada",
    /apartment/i.test(room.type) && "apartment",
    !room.isAvailable && "unavailable",
    selected && "selected",
  );
  const occupancy = `${room.participants.length}/${room.eventCapacity}`;

  return (
    <g
      className={className}
      transform={`translate(${x},${y})`}
      role="button"
      tabIndex={0}
      aria-label={`${room.roomNumber}, ${occupancy} assigned`}
      onClick={() => onSelect(room.dbRoomId)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(room.dbRoomId);
        }
      }}
      style={{ cursor: "pointer", outline: "none" }}
    >
      <rect width={width} height={height} rx="8" />
      <text className="num" x={width / 2} y={height / 2 - 8}>
        {displayRoomNumber(room)}
      </text>
      <text className="sub" x={width / 2} y={height - 15}>
        {occupancy}
      </text>
    </g>
  );
}

function AssignmentPanel({
  selectedRoom,
  groups,
  selectedGroupId,
  onSelectedGroupChange,
  selectedGroup,
  loadingGroups,
  assigning,
  selectedGroupAlreadyInRoom,
  selectedGroupWouldExceed,
  onAssign,
  onUnassign,
}: {
  selectedRoom: Room | null;
  groups: RegistrationGroup[];
  selectedGroupId: string;
  onSelectedGroupChange: (groupId: string) => void;
  selectedGroup: RegistrationGroup | null;
  loadingGroups: boolean;
  assigning: boolean;
  selectedGroupAlreadyInRoom: boolean;
  selectedGroupWouldExceed: boolean;
  onAssign: () => void;
  onUnassign: (assignment: RoomAssignment) => void;
}) {
  if (!selectedRoom) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
        <MapIcon className="mb-3 size-8 text-muted-foreground" />
        <p className="text-sm font-medium">Select a room</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Click a room on the floor plan or list to assign a registration group.
        </p>
      </div>
    );
  }

  const assignments = selectedRoom.assignments ?? [];

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Selected room</p>
            <h3 className="font-mono text-xl font-semibold">{selectedRoom.roomNumber}</h3>
          </div>
          <Badge variant={selectedRoom.isAvailable ? "outline" : "destructive"}>
            {selectedRoom.isAvailable ? "Available" : "Unavailable"}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <InfoTile label="Building" value={selectedRoom.building} />
          <InfoTile label="Floor" value={selectedRoom.floorName} />
          <InfoTile label="Type" value={selectedRoom.type} />
          <InfoTile label="Assigned" value={`${selectedRoom.participants.length}/${selectedRoom.eventCapacity}`} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {selectedRoom.hasAc ? <Badge variant="secondary">A/C</Badge> : null}
          {selectedRoom.isAccessible || /ada/i.test(selectedRoom.note) ? <Badge variant="secondary">ADA</Badge> : null}
          {selectedRoom.lodgingCategoryName ? (
            <Badge variant="outline">{selectedRoom.lodgingCategoryName}</Badge>
          ) : null}
        </div>

        {selectedRoom.note ? (
          <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">{selectedRoom.note}</p>
        ) : null}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">Current assignments</h4>
          <Badge variant="secondary" className="text-[10px]">
            {assignments.length} group(s)
          </Badge>
        </div>

        {assignments.length ? (
          <div className="space-y-2">
            {assignments.map((assignment) => (
              <div key={assignment.assignmentId} className="rounded-lg border p-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono font-semibold">{assignment.groupCode}</p>
                    <p className="text-muted-foreground">{assignment.confirmationCode}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => onUnassign(assignment)}
                    disabled={assigning}
                  >
                    <X className="mr-1 size-3" />
                    Unassign
                  </Button>
                </div>
                <p className="mt-2 text-muted-foreground">
                  {assignment.participants.map((participant) => personName(participant)).join(", ")}
                </p>
                {assignment.additionalRequests ? (
                  <p className="mt-2 rounded bg-amber-50 p-2 text-amber-800">
                    Request: {assignment.additionalRequests}
                  </p>
                ) : null}
                {assignment.notes ? (
                  <p className="mt-2 rounded bg-muted p-2 text-muted-foreground">Note: {assignment.notes}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">No groups assigned.</p>
        )}
      </section>

      <section className="space-y-3 border-t pt-4">
        <div>
          <h4 className="text-sm font-medium">Assign registration</h4>
          <p className="text-xs text-muted-foreground">
            Search by confirmation code, group code, participant name, note, or request.
          </p>
        </div>

        <RegistrationGroupPicker
          groups={groups}
          value={selectedGroupId}
          onValueChange={onSelectedGroupChange}
          disabled={loadingGroups || assigning || !selectedRoom.isAvailable}
        />

        {selectedGroup ? <GroupPreview group={selectedGroup} /> : null}

        {selectedGroupWouldExceed ? (
          <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            This assignment would exceed the room capacity.
          </p>
        ) : null}

        <Button
          type="button"
          className="w-full gap-1.5"
          onClick={onAssign}
          disabled={
            assigning ||
            loadingGroups ||
            !selectedRoom.isAvailable ||
            !selectedGroup ||
            selectedGroupAlreadyInRoom ||
            selectedGroupWouldExceed
          }
        >
          {assigning ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          {selectedGroupAlreadyInRoom ? "Already assigned here" : "Assign to selected room"}
        </Button>
      </section>
    </div>
  );
}

function RegistrationGroupPicker({
  groups,
  value,
  onValueChange,
  disabled,
}: {
  groups: RegistrationGroup[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = groups.find((group) => group.id === value) ?? null;

  useEffect(() => {
    if (!open) setQuery(selected ? groupLabel(selected) : "");
  }, [open, selected]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups.slice(0, 50);
    return groups.filter((group) => groupSearchText(group).includes(q)).slice(0, 50);
  }, [groups, query]);

  return (
    <div ref={containerRef} className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
      <Input
        value={query}
        disabled={disabled}
        onChange={(event) => {
          setQuery(event.target.value);
          if (value) onValueChange("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search registration or group..."
        className="h-9 pl-8 text-sm"
        autoComplete="off"
      />

      {open && !disabled ? (
        <div className="absolute z-50 mt-1 max-h-[330px] w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {filtered.length ? (
            filtered.map((group) => {
              const isSelected = value === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  className={cn(
                    "relative w-full rounded-sm px-2 py-2 pr-8 text-left text-sm outline-none hover:bg-accent",
                    isSelected && "bg-accent",
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onValueChange(group.id);
                    setQuery(groupLabel(group));
                    setOpen(false);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{group.confirmationCode}</span>
                    <span className="font-mono text-xs text-muted-foreground">{group.displayGroupCode}</span>
                    <Badge variant={group.assignedRoomNumber ? "secondary" : "outline"} className="ml-auto text-[10px]">
                      {group.assignedRoomNumber ?? "Unassigned"}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="size-3" />
                    <span className="truncate">{memberSummary(group)}</span>
                  </div>
                  {group.additionalRequests || group.notes ? (
                    <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      {[group.additionalRequests && `Request: ${group.additionalRequests}`, group.notes && `Note: ${group.notes}`]
                        .filter(Boolean)
                        .join(" | ")}
                    </div>
                  ) : null}
                  {isSelected ? (
                    <span className="absolute right-2 top-3 flex size-4 items-center justify-center">
                      <Check className="size-4" />
                    </span>
                  ) : null}
                </button>
              );
            })
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">No matching registrations.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function GroupPreview({ group }: { group: RegistrationGroup }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono">
          {group.displayGroupCode}
        </Badge>
        <span className="text-muted-foreground">{group.memberCount} member(s)</span>
        {group.assignedRoomNumber ? (
          <Badge variant="secondary">
            <DoorOpen className="mr-1 size-3" />
            {group.assignedRoomNumber}
          </Badge>
        ) : null}
      </div>
      <p className="mt-2 text-muted-foreground">{memberSummary(group)}</p>
      {group.additionalRequests ? (
        <p className="mt-2 rounded bg-amber-50 p-2 text-amber-800">Request: {group.additionalRequests}</p>
      ) : null}
      {group.notes ? <p className="mt-2 rounded bg-background p-2 text-muted-foreground">Note: {group.notes}</p> : null}
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="truncate font-medium" title={value}>
        {value}
      </p>
    </div>
  );
}

type Cell = { kind: "room"; room: Room } | { kind: "placeholder"; label: string };

function toCells(rooms: Room[]): Cell[] {
  return rooms.map((room) => ({ kind: "room" as const, room }));
}

function buildSections(rooms: Room[], buildingCode: string) {
  if (buildingCode === "LLC") {
    const floorNum = rooms[0]?.floor ?? 1;
    const base = floorNum * 100;
    const inRange = (n: number, lo: number, hi: number) => n >= base + lo && n <= base + hi;
    const section1 = roomSection(rooms, (n) => inRange(n, 0, 15));
    const section4 = roomSection(rooms, (n) => n >= base + 54);
    if (floorNum === 1) {
      section1.top = [{ kind: "placeholder", label: "101" }, ...section1.top];
      section4.top = [...section4.top, { kind: "placeholder", label: "169" }];
    }
    return [
      section1,
      roomSection(rooms, (n) => inRange(n, 16, 33)),
      roomSection(rooms, (n) => inRange(n, 34, 53)),
      section4,
    ].filter((section) => section.top.length || section.bottom.length);
  }

  const sorted = [...rooms].sort(compareRooms);
  const midpoint = Math.ceil(sorted.length / 2);
  return [
    {
      top: toCells(sorted.slice(0, midpoint).filter((r) => numericRoomNumber(r) % 2 === 1)),
      bottom: toCells(sorted.slice(0, midpoint).filter((r) => numericRoomNumber(r) % 2 === 0)),
    },
    {
      top: toCells(sorted.slice(midpoint).filter((r) => numericRoomNumber(r) % 2 === 1)),
      bottom: toCells(sorted.slice(midpoint).filter((r) => numericRoomNumber(r) % 2 === 0)),
    },
  ].filter((section) => section.top.length || section.bottom.length);
}

function roomSection(rooms: Room[], predicate: (roomNumber: number) => boolean) {
  const sectionRooms = rooms.filter((room) => predicate(numericRoomNumber(room))).sort(compareRooms);
  let top = sectionRooms.filter((room) => numericRoomNumber(room) % 2 === 1);
  let bottom = sectionRooms.filter((room) => numericRoomNumber(room) % 2 === 0);

  if (!top.length || !bottom.length) {
    const midpoint = Math.ceil(sectionRooms.length / 2);
    top = sectionRooms.slice(0, midpoint);
    bottom = sectionRooms.slice(midpoint);
  }

  return { top: toCells(top) as Cell[], bottom: toCells(bottom) as Cell[] };
}

function compareRooms(a: Room, b: Room) {
  return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
}

function numericRoomNumber(room: Room) {
  const match = displayRoomNumber(room).match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function displayRoomNumber(room: Room) {
  const prefix = `${room.buildingCode}-`;
  return room.roomNumber.startsWith(prefix) ? room.roomNumber.slice(prefix.length) : room.roomNumber;
}

function personName(person: Pick<Participant, "firstName" | "lastName" | "displayNameKo">) {
  return person.displayNameKo || `${person.firstName} ${person.lastName}`.trim();
}

function memberSummary(group: RegistrationGroup) {
  return group.members.map(personName).filter(Boolean).join(", ") || "No members";
}

function groupLabel(group: RegistrationGroup) {
  return `${group.confirmationCode} / ${group.displayGroupCode}`;
}

function groupSearchText(group: RegistrationGroup) {
  return [
    group.confirmationCode,
    group.displayGroupCode,
    group.assignedRoomNumber,
    group.churchName,
    group.notes,
    group.additionalRequests,
    ...group.members.flatMap((member) => [
      member.firstName,
      member.lastName,
      member.displayNameKo,
      member.churchName,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
