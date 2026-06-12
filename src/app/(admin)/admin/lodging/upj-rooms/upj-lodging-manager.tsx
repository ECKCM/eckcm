"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Download,
  Building2,
  Eye,
  Users,
  Hotel,
  Loader2,
  BedDouble,
  RefreshCw,
  Upload,
  Pencil,
  Snowflake,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface Participant {
  firstName: string;
  lastName: string;
  displayNameKo: string | null;
  arrival: string | null;
  departure: string | null;
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
  eventCapacityOverride: number | null;
  eventCapacityDefault: number;
  hasAc: boolean;
  isAccessible: boolean;
  isAvailable: boolean;
  lodgingCategory: string;
  lodgingCategoryName: string;
  note: string;
  assignmentId: string | null;
  groupId: string | null;
  groupCode: string | null;
  participants: Participant[];
}

interface CategoryOption {
  code: string;
  name: string;
}

type ViewMode = "event" | "host";

interface RoomPatch {
  categoryCode?: string;
  eventCapacityOverride?: number | null;
  hasAc?: boolean;
  isAvailable?: boolean;
}

// ─── Component ──────────────────────────────────────────────────

export function UPJLodgingManager() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("event");
  const [buildingFilter, setBuildingFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [upjStaffPath, setUpjStaffPath] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/lodging/upj-rooms");
      if (!res.ok) throw new Error("Failed to load rooms");
      const data = await res.json();
      setRooms(data.rooms ?? []);
      setCategories(data.categories ?? []);
      setUpjStaffPath(data.upjStaffPath ?? null);
    } catch (err) {
      toast.error("Failed to load UPJ rooms");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/lodging/upj-export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `UPJ-Lodging-Export-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel files exported");
    } catch {
      toast.error("Failed to export Excel files");
    } finally {
      setExporting(false);
    }
  };

  const handleShareUpjLink = async () => {
    if (!upjStaffPath) {
      toast.error("UPJ staff link unavailable — configure the e-pass secret first.");
      return;
    }
    const url = `${window.location.origin}${upjStaffPath}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("UPJ staff link copied to clipboard");
    } catch {
      toast.message(url);
    }
    window.open(upjStaffPath, "_blank", "noopener");
  };

  const handleImport = async (force = false) => {
    if (force && !confirm("This will delete all existing buildings/rooms and re-import from UPJ Excel files. Continue?")) return;
    setImporting(true);
    try {
      const res = await fetch("/api/admin/lodging/upj-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      toast.success(`Imported ${data.imported.buildings} buildings, ${data.imported.rooms} rooms`);
      await loadRooms();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import");
    } finally {
      setImporting(false);
    }
  };

  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  const updateRoom = useCallback(
    async (room: Room, patch: RoomPatch): Promise<boolean> => {
      try {
        const res = await fetch("/api/admin/lodging/upj-rooms", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: room.dbRoomId, ...patch }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to update");
        }

        setRooms((prev) =>
          prev.map((r) => {
            if (r.dbRoomId !== room.dbRoomId) return r;
            const next = { ...r };
            if ("categoryCode" in patch) {
              next.lodgingCategory = patch.categoryCode ?? "";
              next.lodgingCategoryName =
                categories.find((c) => c.code === patch.categoryCode)?.name ?? "";
            }
            if ("eventCapacityOverride" in patch) {
              next.eventCapacityOverride = patch.eventCapacityOverride ?? null;
              next.eventCapacity =
                patch.eventCapacityOverride != null
                  ? patch.eventCapacityOverride
                  : r.eventCapacityDefault;
            }
            if ("hasAc" in patch) next.hasAc = Boolean(patch.hasAc);
            if ("isAvailable" in patch) next.isAvailable = Boolean(patch.isAvailable);
            return next;
          })
        );
        toast.success(`${room.roomNumber} updated`);
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update room");
        return false;
      }
    },
    [categories]
  );

  // ─── Derived Data ─────────────────────────────────────────

  const buildings = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rooms) {
      if (!map.has(r.buildingCode)) map.set(r.buildingCode, r.building);
    }
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    let result = rooms;
    if (buildingFilter !== "ALL") {
      result = result.filter((r) => r.buildingCode === buildingFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.roomNumber.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          r.lodgingCategoryName.toLowerCase().includes(q) ||
          r.groupCode?.toLowerCase().includes(q) ||
          r.participants.some(
            (p) =>
              p.firstName.toLowerCase().includes(q) ||
              p.lastName.toLowerCase().includes(q)
          )
      );
    }
    return result;
  }, [rooms, buildingFilter, search]);

  const roomsByFloor = useMemo(() => {
    const map = new Map<string, Room[]>();
    for (const room of filteredRooms) {
      const key = `${room.buildingCode}-F${room.floor}`;
      const arr = map.get(key) ?? [];
      arr.push(room);
      map.set(key, arr);
    }
    return map;
  }, [filteredRooms]);

  const stats = useMemo(() => {
    const filtered =
      buildingFilter === "ALL"
        ? rooms
        : rooms.filter((r) => r.buildingCode === buildingFilter);
    return {
      total: filtered.length,
      available: filtered.filter((r) => r.isAvailable).length,
      assigned: filtered.filter((r) => r.participants.length > 0).length,
      totalPeople: filtered.reduce((s, r) => s + r.participants.length, 0),
    };
  }, [rooms, buildingFilter]);

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 border-b px-4 py-3 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as ViewMode)}
          >
            <TabsList>
              <TabsTrigger value="event" className="gap-1.5 text-xs">
                <Users className="size-3.5" />
                Event Lodging
              </TabsTrigger>
              <TabsTrigger value="host" className="gap-1.5 text-xs">
                <Hotel className="size-3.5" />
                Host Lodging (UPJ)
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={buildingFilter} onValueChange={setBuildingFilter}>
            <SelectTrigger className="w-[200px] h-9">
              <Building2 className="size-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="All Buildings" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Buildings</SelectItem>
              {buildings.map((b) => (
                <SelectItem key={b.code} value={b.code}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <SearchInput
            placeholder="Search rooms, names, category..."
            value={search}
            onValueChange={setSearch}
            containerClassName="flex-1 max-w-xs h-9"
            className="text-sm"
          />

          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={loadRooms}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCw
                className={cn("size-3.5", loading && "animate-spin")}
              />
              Refresh
            </Button>
            <Button asChild variant="default" size="sm" className="gap-1.5">
              <Link href="/admin/room-groups">
                <BedDouble className="size-3.5" />
                Assign Rooms
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShareUpjLink}
              disabled={!upjStaffPath}
              className="gap-1.5"
              title="Open and copy the read-only link for UPJ staff"
            >
              <Share2 className="size-3.5" />
              UPJ Staff View
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exporting}
              className="gap-1.5"
            >
              {exporting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              Export Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleImport(rooms.length > 0)}
              disabled={importing}
              className="gap-1.5"
            >
              {importing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              {importing ? "Importing..." : "Re-import"}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">{stats.total}</strong> rooms
          </span>
          <span>
            <strong className="text-foreground">{stats.available}</strong>{" "}
            available
          </span>
          <span>
            <strong className="text-foreground">{stats.assigned}</strong>{" "}
            assigned
          </span>
          <span>
            <strong className="text-foreground">{stats.totalPeople}</strong>{" "}
            people
          </span>
          {viewMode === "host" && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Eye className="size-3" />
              UPJ Host Capacity (Single: 1, Double: 2)
            </Badge>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 space-y-4">
            <p>No rooms found in the database.</p>
            <p className="text-xs">
              Import room data from UPJ Excel files, or configure manually in{" "}
              <Link
                href="/admin/settings/lodging"
                className="underline text-primary"
              >
                Settings &gt; Lodging
              </Link>
            </p>
            <Button
              onClick={() => handleImport(false)}
              disabled={importing}
              className="gap-1.5"
            >
              {importing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              {importing ? "Importing..." : "Import from UPJ Excel"}
            </Button>
          </div>
        ) : filteredRooms.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">
            No rooms match your search.
          </p>
        ) : (
          <div className="px-4 pb-4">
            {Array.from(roomsByFloor.entries()).map(([floorKey, floorRooms]) => {
              const first = floorRooms[0];
              return (
                <div key={floorKey} className="mb-6">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 sticky top-0 bg-background py-1 z-10">
                    {first.building} — {first.floorName}{" "}
                    <span className="text-xs font-normal">
                      ({floorRooms.length} rooms)
                    </span>
                  </h3>
                  {viewMode === "event" ? (
                    <EventTable rooms={floorRooms} onEdit={setEditingRoom} />
                  ) : (
                    <HostTable rooms={floorRooms} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <RoomEditDialog
        room={editingRoom}
        categories={categories}
        onClose={() => setEditingRoom(null)}
        onSave={updateRoom}
      />
    </div>
  );
}

// ─── Event Lodging Table ────────────────────────────────────────

function EventTable({
  rooms,
  onEdit,
}: {
  rooms: Room[];
  onEdit: (room: Room) => void;
}) {
  return (
    <div className="border rounded-md overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-24">Room #</TableHead>
            <TableHead className="w-16">Type</TableHead>
            <TableHead className="w-12 text-center">A/C</TableHead>
            <TableHead className="w-12 text-center">Cap</TableHead>
            <TableHead className="w-20 text-center">Assigned</TableHead>
            <TableHead className="w-20">Group</TableHead>
            <TableHead className="w-48">Category</TableHead>
            <TableHead>Participants</TableHead>
            <TableHead className="w-24">Note</TableHead>
            <TableHead className="w-12 text-center">Edit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rooms.map((room) => {
            const isFull = room.participants.length >= room.eventCapacity;
            const isEmpty = room.participants.length === 0;

            return (
              <TableRow
                key={room.dbRoomId}
                className={cn(!room.isAvailable && "opacity-40")}
              >
                <TableCell className="font-mono text-xs font-medium py-2">
                  {room.roomNumber}
                </TableCell>
                <TableCell className="text-xs py-2">{room.type}</TableCell>
                <TableCell className="text-center py-2">
                  {room.hasAc ? (
                    <Snowflake className="size-3.5 text-sky-500 inline" />
                  ) : (
                    <span className="text-muted-foreground/50 text-[10px]">—</span>
                  )}
                </TableCell>
                <TableCell className="text-center text-xs py-2">
                  <span
                    className={cn(
                      room.eventCapacityOverride != null &&
                        "font-semibold text-primary underline decoration-dotted"
                    )}
                    title={
                      room.eventCapacityOverride != null
                        ? `Overridden (default ${room.eventCapacityDefault})`
                        : undefined
                    }
                  >
                    {room.eventCapacity}
                  </span>
                </TableCell>
                <TableCell className="text-center py-2">
                  <Badge
                    variant={isEmpty ? "outline" : isFull ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {room.participants.length}/{room.eventCapacity}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs py-2">
                  {room.groupCode ?? "—"}
                </TableCell>
                <TableCell className="text-xs py-2">
                  {room.lodgingCategoryName || (
                    <span className="text-muted-foreground/50 italic text-[10px]">
                      Not set
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs py-2">
                  {room.participants.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {room.participants.map((p, i) => (
                        <span
                          key={i}
                          className={cn(
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px]",
                            i === 0
                              ? "bg-primary/10 text-primary font-medium"
                              : "bg-muted"
                          )}
                        >
                          {p.firstName} {p.lastName}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground/50 italic text-[10px]">
                      —
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-[10px] text-muted-foreground py-2">
                  {room.note || "—"}
                </TableCell>
                <TableCell className="text-center py-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => onEdit(room)}
                    title="Edit room"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Host Lodging Table (UPJ Excel format) ──────────────────────

function HostTable({ rooms }: { rooms: Room[] }) {
  const rows: {
    room: Room;
    slotIndex: number;
    participant: Participant | null;
    isFirstSlot: boolean;
  }[] = [];

  for (const room of rooms) {
    for (let i = 0; i < room.hostCapacity; i++) {
      rows.push({
        room,
        slotIndex: i,
        participant: room.participants[i] ?? null,
        isFirstSlot: i === 0,
      });
    }
  }

  return (
    <div className="border rounded-md overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-24">Room #</TableHead>
            <TableHead className="w-20">Type</TableHead>
            <TableHead className="w-36">First Name</TableHead>
            <TableHead className="w-36">Last Name</TableHead>
            <TableHead className="w-28">Arrival</TableHead>
            <TableHead className="w-28">Departure</TableHead>
            <TableHead className="w-28">Building</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow
              key={`${row.room.dbRoomId}-${row.slotIndex}`}
              className={cn(
                !row.room.isAvailable && "opacity-40",
                !row.isFirstSlot && "border-t-0",
                row.isFirstSlot && idx > 0 && "border-t-2"
              )}
            >
              <TableCell
                className={cn(
                  "font-mono text-xs py-2",
                  row.isFirstSlot ? "font-medium" : ""
                )}
              >
                {row.isFirstSlot ? row.room.roomNumber : ""}
              </TableCell>
              <TableCell className="text-xs py-2">
                {row.isFirstSlot ? row.room.type : ""}
              </TableCell>
              <TableCell className="text-xs py-2 font-medium">
                {row.participant?.firstName ?? ""}
              </TableCell>
              <TableCell className="text-xs py-2">
                {row.participant?.lastName ?? ""}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground py-2">
                {row.participant?.arrival ? formatDate(row.participant.arrival) : ""}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground py-2">
                {row.participant?.departure ? formatDate(row.participant.departure) : ""}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground py-2">
                {row.isFirstSlot ? row.room.building : ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Room Edit Dialog ───────────────────────────────────────────

function RoomEditDialog({
  room,
  categories,
  onClose,
  onSave,
}: {
  room: Room | null;
  categories: CategoryOption[];
  onClose: () => void;
  onSave: (room: Room, patch: RoomPatch) => Promise<boolean>;
}) {
  const [capacity, setCapacity] = useState("");
  const [hasAc, setHasAc] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [category, setCategory] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!room) return;
    setCapacity(
      room.eventCapacityOverride != null ? String(room.eventCapacityOverride) : ""
    );
    setHasAc(room.hasAc);
    setIsAvailable(room.isAvailable);
    setCategory(room.lodgingCategory ?? "");
  }, [room]);

  if (!room) return null;

  const NO_CATEGORY = "__none__";

  const handleSave = async () => {
    const trimmed = capacity.trim();
    const override = trimmed === "" ? null : Number(trimmed);
    if (override != null && (!Number.isInteger(override) || override < 0)) {
      toast.error("Capacity must be a non-negative whole number");
      return;
    }

    setSaving(true);
    const ok = await onSave(room, {
      eventCapacityOverride: override,
      hasAc,
      isAvailable,
      categoryCode: category === NO_CATEGORY ? "" : category,
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open={!!room} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{room.roomNumber}</DialogTitle>
          <DialogDescription>
            {room.building} — {room.floorName} · {room.type}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Event capacity */}
          <div className="space-y-1.5">
            <Label htmlFor="room-capacity">Event Capacity</Label>
            <Input
              id="room-capacity"
              type="number"
              min={0}
              inputMode="numeric"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder={`Default: ${room.eventCapacityDefault}`}
            />
            <p className="text-[11px] text-muted-foreground">
              Max participants for the event. Leave blank to use the type-derived
              default ({room.eventCapacityDefault}).
            </p>
          </div>

          {/* A/C */}
          <div className="flex items-center justify-between">
            <Label htmlFor="room-ac" className="flex items-center gap-1.5">
              <Snowflake className="size-3.5 text-sky-500" />
              Air Conditioning
            </Label>
            <Switch id="room-ac" checked={hasAc} onCheckedChange={setHasAc} />
          </div>

          {/* Available */}
          <div className="flex items-center justify-between">
            <Label htmlFor="room-available">Available</Label>
            <Switch
              id="room-available"
              checked={isAvailable}
              onCheckedChange={setIsAvailable}
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Lodging Category</Label>
            <Select
              value={category || NO_CATEGORY}
              onValueChange={(v) => setCategory(v === NO_CATEGORY ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY} className="text-muted-foreground">
                  Not set
                </SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
}
