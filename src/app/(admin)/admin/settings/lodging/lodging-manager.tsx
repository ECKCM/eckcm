"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  Building2,
  Layers,
  DoorOpen,
  Wand2,
} from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";

// ─── Types ──────────────────────────────────────────────────────

interface Building {
  id: string;
  name_en: string;
  short_code: string | null;
  sort_order: number;
  is_active: boolean;
}

interface Floor {
  id: string;
  building_id: string;
  floor_number: number;
  name_en: string | null;
  name_ko: string | null;
  sort_order: number;
}

interface Room {
  id: string;
  floor_id: string;
  room_number: string;
  capacity: number;
  has_ac: boolean;
  fee_per_night_cents: number;
  is_accessible: boolean;
  is_available: boolean;
}

type DialogMode =
  | { type: "building"; editing: Building | null }
  | { type: "floor"; buildingId: string; editing: Floor | null }
  | { type: "room"; floorId: string; editing: Room | null }
  | { type: "bulk-rooms"; floorId: string }
  | null;

// ─── Component ──────────────────────────────────────────────────

export function LodgingManager() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "building" | "floor" | "room";
    id: string;
    label: string;
  } | null>(null);

  // Form states
  const [buildingForm, setBuildingForm] = useState({
    name_en: "",
    short_code: "",
    sort_order: 0,
    is_active: true,
  });
  const [floorForm, setFloorForm] = useState({
    floor_number: 1,
    name_en: "",
    name_ko: "",
    sort_order: 0,
  });
  const [roomForm, setRoomForm] = useState({
    room_number: "",
    capacity: 4,
    has_ac: false,
    fee_per_night_cents: 0,
    is_accessible: false,
    is_available: true,
  });
  const [bulkForm, setBulkForm] = useState({
    prefix: "",
    start: 1,
    count: 10,
    capacity: 4,
    has_ac: false,
    fee_per_night_cents: 0,
  });

  // ─── Load all lodging data ────────────────────────────────────

  const loadData = useCallback(async () => {
    const supabase = createClient();

    const { data: bData } = await supabase
      .from("eckcm_buildings")
      .select("*")
      .order("sort_order");

    setBuildings(bData ?? []);

    if (bData?.length) {
      const buildingIds = bData.map((b) => b.id);

      const { data: fData } = await supabase
        .from("eckcm_floors")
        .select("*")
        .in("building_id", buildingIds)
        .order("sort_order");

      setFloors(fData ?? []);

      if (fData?.length) {
        const floorIds = fData.map((f) => f.id);
        const { data: rData } = await supabase
          .from("eckcm_rooms")
          .select("*")
          .in("floor_id", floorIds)
          .order("room_number");

        setRooms(rData ?? []);
      } else {
        setRooms([]);
      }
    } else {
      setFloors([]);
      setRooms([]);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Building CRUD ────────────────────────────────────────────

  const openBuildingDialog = (editing: Building | null) => {
    if (editing) {
      setBuildingForm({
        name_en: editing.name_en,
        short_code: editing.short_code ?? "",
        sort_order: editing.sort_order,
        is_active: editing.is_active,
      });
    } else {
      setBuildingForm({ name_en: "", short_code: "", sort_order: buildings.length, is_active: true });
    }
    setDialogMode({ type: "building", editing });
  };

  const saveBuilding = async () => {
    if (!buildingForm.name_en.trim()) {
      toast.error("Building name is required");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const payload = {
      name_en: buildingForm.name_en.trim(),
      short_code: buildingForm.short_code.trim() || null,
      sort_order: buildingForm.sort_order,
      is_active: buildingForm.is_active,
    };

    const editing = dialogMode?.type === "building" ? dialogMode.editing : null;
    if (editing) {
      const { error } = await supabase.from("eckcm_buildings").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Building updated");
    } else {
      const { error } = await supabase.from("eckcm_buildings").insert(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Building created");
    }
    setSaving(false);
    setDialogMode(null);
    loadData();
  };

  // ─── Floor CRUD ───────────────────────────────────────────────

  const openFloorDialog = (buildingId: string, editing: Floor | null) => {
    const existingFloors = floors.filter((f) => f.building_id === buildingId);
    if (editing) {
      setFloorForm({
        floor_number: editing.floor_number,
        name_en: editing.name_en ?? "",
        name_ko: editing.name_ko ?? "",
        sort_order: editing.sort_order,
      });
    } else {
      setFloorForm({
        floor_number: existingFloors.length + 1,
        name_en: "",
        name_ko: "",
        sort_order: existingFloors.length,
      });
    }
    setDialogMode({ type: "floor", buildingId, editing });
  };

  const saveFloor = async () => {
    setSaving(true);
    const supabase = createClient();
    const buildingId = dialogMode?.type === "floor" ? dialogMode.buildingId : "";
    const editing = dialogMode?.type === "floor" ? dialogMode.editing : null;

    const payload = {
      building_id: buildingId,
      floor_number: floorForm.floor_number,
      name_en: floorForm.name_en.trim() || null,
      name_ko: floorForm.name_ko.trim() || null,
      sort_order: floorForm.sort_order,
    };

    if (editing) {
      const { error } = await supabase.from("eckcm_floors").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Floor updated");
    } else {
      const { error } = await supabase.from("eckcm_floors").insert(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Floor created");
    }
    setSaving(false);
    setDialogMode(null);
    loadData();
  };

  // ─── Room CRUD ────────────────────────────────────────────────

  const openRoomDialog = (floorId: string, editing: Room | null) => {
    if (editing) {
      setRoomForm({
        room_number: editing.room_number,
        capacity: editing.capacity,
        has_ac: editing.has_ac,
        fee_per_night_cents: editing.fee_per_night_cents,
        is_accessible: editing.is_accessible,
        is_available: editing.is_available,
      });
    } else {
      setRoomForm({
        room_number: "",
        capacity: 4,
        has_ac: false,
        fee_per_night_cents: 0,
        is_accessible: false,
        is_available: true,
      });
    }
    setDialogMode({ type: "room", floorId, editing });
  };

  const saveRoom = async () => {
    if (!roomForm.room_number.trim()) {
      toast.error("Room number is required");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const floorId = dialogMode?.type === "room" ? dialogMode.floorId : "";
    const editing = dialogMode?.type === "room" ? dialogMode.editing : null;

    const payload = {
      floor_id: floorId,
      room_number: roomForm.room_number.trim(),
      capacity: roomForm.capacity,
      has_ac: roomForm.has_ac,
      fee_per_night_cents: roomForm.fee_per_night_cents,
      is_accessible: roomForm.is_accessible,
      is_available: roomForm.is_available,
    };

    if (editing) {
      const { error } = await supabase.from("eckcm_rooms").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Room updated");
    } else {
      const { error } = await supabase.from("eckcm_rooms").insert(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Room created");
    }
    setSaving(false);
    setDialogMode(null);
    loadData();
  };

  // ─── Bulk room generation ─────────────────────────────────────

  const openBulkDialog = (floorId: string) => {
    setBulkForm({ prefix: "", start: 1, count: 10, capacity: 4, has_ac: false, fee_per_night_cents: 0 });
    setDialogMode({ type: "bulk-rooms", floorId });
  };

  const saveBulkRooms = async () => {
    if (bulkForm.count < 1 || bulkForm.count > 100) {
      toast.error("Count must be 1-100");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const floorId = dialogMode?.type === "bulk-rooms" ? dialogMode.floorId : "";

    const newRooms = Array.from({ length: bulkForm.count }, (_, i) => ({
      floor_id: floorId,
      room_number: `${bulkForm.prefix}${bulkForm.start + i}`,
      capacity: bulkForm.capacity,
      has_ac: bulkForm.has_ac,
      fee_per_night_cents: bulkForm.fee_per_night_cents,
      is_accessible: false,
      is_available: true,
    }));

    const { error } = await supabase.from("eckcm_rooms").insert(newRooms);
    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }
    toast.success(`${bulkForm.count} rooms created`);
    setSaving(false);
    setDialogMode(null);
    loadData();
  };

  // ─── Delete handler ───────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const supabase = createClient();
    const table =
      deleteTarget.type === "building"
        ? "eckcm_buildings"
        : deleteTarget.type === "floor"
          ? "eckcm_floors"
          : "eckcm_rooms";

    const { error } = await supabase.from(table).delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${deleteTarget.type} deleted`);
      loadData();
    }
    setDeleteTarget(null);
  };

  // ─── Helpers ──────────────────────────────────────────────────

  const floorsForBuilding = (buildingId: string) =>
    floors.filter((f) => f.building_id === buildingId);

  const roomsForFloor = (floorId: string) =>
    rooms.filter((r) => r.floor_id === floorId);

  const centsToStr = (c: number) => (c / 100).toFixed(2);
  const strToCents = (s: string) => Math.round(parseFloat(s || "0") * 100);

  if (loading) {
    return <p className="text-center text-muted-foreground py-8">Loading...</p>;
  }

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Manage buildings, floors, and rooms. These are shared across all events.
        Rooms can be assigned to groups from the Room Groups page.
      </p>

      <div className="flex items-center gap-3">
        <Button onClick={() => openBuildingDialog(null)}>
          <Plus className="mr-2 size-4" />
          Add Building
        </Button>
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>{buildings.length} building(s)</span>
        <span>{floors.length} floor(s)</span>
        <span>{rooms.length} room(s)</span>
        <span>
          {rooms.reduce((s, r) => s + r.capacity, 0)} total capacity
        </span>
      </div>

      {/* Buildings */}
      {buildings.length === 0 ? (
        <Card>
          <CardContent className="text-center text-muted-foreground py-12">
            No buildings yet. Click &quot;Add Building&quot; to get started.
          </CardContent>
        </Card>
      ) : (
        buildings.map((building) => (
          <Collapsible key={building.id} defaultOpen>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CollapsibleTrigger className="flex items-center gap-2 hover:underline">
                    <Building2 className="size-4" />
                    <CardTitle className="text-base">
                      {building.name_en}
                      {building.short_code && (
                        <Badge variant="outline" className="ml-2 font-mono text-xs">
                          {building.short_code}
                        </Badge>
                      )}
                    </CardTitle>
                    {!building.is_active && (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </CollapsibleTrigger>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openBuildingDialog(building)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setDeleteTarget({
                          type: "building",
                          id: building.id,
                          label: building.name_en,
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="space-y-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openFloorDialog(building.id, null)}
                  >
                    <Plus className="mr-1 size-3" />
                    Add Floor
                  </Button>

                  {floorsForBuilding(building.id).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No floors yet.
                    </p>
                  ) : (
                    floorsForBuilding(building.id).map((floor) => (
                      <div
                        key={floor.id}
                        className="border rounded-lg p-3 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Layers className="size-4 text-muted-foreground" />
                            <span className="font-medium text-sm">
                              Floor {floor.floor_number}
                              {floor.name_en && ` - ${floor.name_en}`}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {roomsForFloor(floor.id).length} rooms
                            </Badge>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => openBulkDialog(floor.id)}
                            >
                              <Wand2 className="mr-1 size-3" />
                              Bulk
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() =>
                                openRoomDialog(floor.id, null)
                              }
                            >
                              <Plus className="mr-1 size-3" />
                              Room
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() =>
                                openFloorDialog(building.id, floor)
                              }
                            >
                              <Pencil className="size-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() =>
                                setDeleteTarget({
                                  type: "floor",
                                  id: floor.id,
                                  label: `Floor ${floor.floor_number}`,
                                })
                              }
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        </div>

                        {roomsForFloor(floor.id).length > 0 && (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Room #</TableHead>
                                <TableHead>Capacity</TableHead>
                                <TableHead>A/C</TableHead>
                                <TableHead>Fee/Night</TableHead>
                                <TableHead>Accessible</TableHead>
                                <TableHead>Available</TableHead>
                                <TableHead className="text-right">
                                  Actions
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {roomsForFloor(floor.id).map((room) => (
                                <TableRow key={room.id}>
                                  <TableCell className="font-mono">
                                    <DoorOpen className="inline mr-1 size-3" />
                                    {room.room_number}
                                  </TableCell>
                                  <TableCell>{room.capacity}</TableCell>
                                  <TableCell>
                                    {room.has_ac ? "Yes" : "-"}
                                  </TableCell>
                                  <TableCell>
                                    {room.fee_per_night_cents > 0
                                      ? `$${centsToStr(room.fee_per_night_cents)}`
                                      : "-"}
                                  </TableCell>
                                  <TableCell>
                                    {room.is_accessible ? "Yes" : "-"}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        room.is_available
                                          ? "default"
                                          : "secondary"
                                      }
                                    >
                                      {room.is_available ? "Yes" : "No"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-7"
                                      onClick={() =>
                                        openRoomDialog(floor.id, room)
                                      }
                                    >
                                      <Pencil className="size-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-7"
                                      onClick={() =>
                                        setDeleteTarget({
                                          type: "room",
                                          id: room.id,
                                          label: `Room ${room.room_number}`,
                                        })
                                      }
                                    >
                                      <Trash2 className="size-3" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))
      )}

      {/* ─── Dialogs ───────────────────────────────────────────── */}

      {/* Building Dialog */}
      <Dialog
        open={dialogMode?.type === "building"}
        onOpenChange={(open) => !open && setDialogMode(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode?.type === "building" && dialogMode.editing
                ? "Edit Building"
                : "Add Building"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Name (English) *</Label>
              <Input
                value={buildingForm.name_en}
                onChange={(e) =>
                  setBuildingForm({ ...buildingForm, name_en: e.target.value })
                }
                placeholder="e.g., Main Lodge"
              />
            </div>
            <div className="space-y-1">
              <Label>Short Code</Label>
              <Input
                value={buildingForm.short_code}
                onChange={(e) =>
                  setBuildingForm({ ...buildingForm, short_code: e.target.value.toUpperCase() })
                }
                placeholder="e.g., ML, AN"
                maxLength={10}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={buildingForm.sort_order}
                  onChange={(e) =>
                    setBuildingForm({
                      ...buildingForm,
                      sort_order: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch
                  checked={buildingForm.is_active}
                  onCheckedChange={(c) =>
                    setBuildingForm({ ...buildingForm, is_active: c })
                  }
                />
                <Label>Active</Label>
              </div>
            </div>
            <Button onClick={saveBuilding} className="w-full" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Floor Dialog */}
      <Dialog
        open={dialogMode?.type === "floor"}
        onOpenChange={(open) => !open && setDialogMode(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode?.type === "floor" && dialogMode.editing
                ? "Edit Floor"
                : "Add Floor"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Floor Number *</Label>
              <Input
                type="number"
                value={floorForm.floor_number}
                onChange={(e) =>
                  setFloorForm({
                    ...floorForm,
                    floor_number: parseInt(e.target.value) || 1,
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Name (English)</Label>
              <Input
                value={floorForm.name_en}
                onChange={(e) =>
                  setFloorForm({ ...floorForm, name_en: e.target.value })
                }
                placeholder="e.g., Ground Floor"
              />
            </div>
            <Button onClick={saveFloor} className="w-full" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Room Dialog */}
      <Dialog
        open={dialogMode?.type === "room"}
        onOpenChange={(open) => !open && setDialogMode(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode?.type === "room" && dialogMode.editing
                ? "Edit Room"
                : "Add Room"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Room Number *</Label>
                <Input
                  value={roomForm.room_number}
                  onChange={(e) =>
                    setRoomForm({ ...roomForm, room_number: e.target.value })
                  }
                  placeholder="e.g., 101"
                />
              </div>
              <div className="space-y-1">
                <Label>Capacity</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={roomForm.capacity}
                  onChange={(e) =>
                    setRoomForm({
                      ...roomForm,
                      capacity: parseInt(e.target.value) || 1,
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Fee Per Night ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={centsToStr(roomForm.fee_per_night_cents)}
                onChange={(e) =>
                  setRoomForm({
                    ...roomForm,
                    fee_per_night_cents: strToCents(e.target.value),
                  })
                }
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={roomForm.has_ac}
                  onCheckedChange={(c) =>
                    setRoomForm({ ...roomForm, has_ac: c })
                  }
                />
                <Label>A/C</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={roomForm.is_accessible}
                  onCheckedChange={(c) =>
                    setRoomForm({ ...roomForm, is_accessible: c })
                  }
                />
                <Label>Accessible</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={roomForm.is_available}
                  onCheckedChange={(c) =>
                    setRoomForm({ ...roomForm, is_available: c })
                  }
                />
                <Label>Available</Label>
              </div>
            </div>
            <Button onClick={saveRoom} className="w-full" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Room Generator Dialog */}
      <Dialog
        open={dialogMode?.type === "bulk-rooms"}
        onOpenChange={(open) => !open && setDialogMode(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Generate Rooms</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate multiple rooms at once. Room numbers will be{" "}
              <span className="font-mono">
                {bulkForm.prefix}{bulkForm.start}
              </span>
              {" "}to{" "}
              <span className="font-mono">
                {bulkForm.prefix}{bulkForm.start + bulkForm.count - 1}
              </span>
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Prefix</Label>
                <Input
                  value={bulkForm.prefix}
                  onChange={(e) =>
                    setBulkForm({ ...bulkForm, prefix: e.target.value })
                  }
                  placeholder="e.g., 1"
                />
              </div>
              <div className="space-y-1">
                <Label>Start #</Label>
                <Input
                  type="number"
                  min={1}
                  value={bulkForm.start}
                  onChange={(e) =>
                    setBulkForm({
                      ...bulkForm,
                      start: parseInt(e.target.value) || 1,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Count</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={bulkForm.count}
                  onChange={(e) =>
                    setBulkForm({
                      ...bulkForm,
                      count: parseInt(e.target.value) || 1,
                    })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Capacity</Label>
                <Input
                  type="number"
                  min={1}
                  value={bulkForm.capacity}
                  onChange={(e) =>
                    setBulkForm({
                      ...bulkForm,
                      capacity: parseInt(e.target.value) || 1,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Fee/Night ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={centsToStr(bulkForm.fee_per_night_cents)}
                  onChange={(e) =>
                    setBulkForm({
                      ...bulkForm,
                      fee_per_night_cents: strToCents(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={bulkForm.has_ac}
                onCheckedChange={(c) =>
                  setBulkForm({ ...bulkForm, has_ac: c })
                }
              />
              <Label>A/C</Label>
            </div>
            <Button onClick={saveBulkRooms} className="w-full" disabled={saving}>
              {saving
                ? "Generating..."
                : `Generate ${bulkForm.count} Rooms`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete ${deleteTarget?.type}?`}
        description={`This will permanently delete "${deleteTarget?.label}" and all its children (floors, rooms, assignments). This action cannot be undone.`}
      />
    </div>
  );
}
