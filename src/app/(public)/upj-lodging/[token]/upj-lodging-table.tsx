"use client";

import { useMemo, useState } from "react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { badgeVariants } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, Printer, Hotel, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types (shared with the server page) ────────────────────────

export interface PublicOccupant {
  firstName: string;
  lastName: string;
  arrival: string | null;
  departure: string | null;
  isRep: boolean;
}

export interface PublicRoom {
  roomNumber: string;
  type: string;
  isAvailable: boolean;
  occupants: PublicOccupant[];
}

export interface PublicFloor {
  floor: number;
  rooms: PublicRoom[];
}

export interface PublicBuilding {
  code: string;
  name: string;
  floors: PublicFloor[];
}

// ─── Component ──────────────────────────────────────────────────

export function UPJLodgingTable({
  buildings,
  generatedAt,
  token,
}: {
  buildings: PublicBuilding[];
  generatedAt: string;
  token: string;
}) {
  const [buildingFilter, setBuildingFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [occupiedOnly, setOccupiedOnly] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/upj-lodging/${encodeURIComponent(token)}/export`,
      );
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return buildings
      .filter((b) => buildingFilter === "ALL" || b.code === buildingFilter)
      .map((b) => ({
        ...b,
        floors: b.floors
          .map((f) => ({
            ...f,
            rooms: f.rooms.filter((room) => {
              if (occupiedOnly && room.occupants.length === 0) return false;
              if (!q) return true;
              if (room.roomNumber.toLowerCase().includes(q)) return true;
              return room.occupants.some(
                (o) =>
                  o.firstName.toLowerCase().includes(q) ||
                  o.lastName.toLowerCase().includes(q),
              );
            }),
          }))
          .filter((f) => f.rooms.length > 0),
      }))
      .filter((b) => b.floors.length > 0);
  }, [buildings, buildingFilter, search, occupiedOnly]);

  const stats = useMemo(() => {
    let rooms = 0;
    let occupied = 0;
    let people = 0;
    for (const b of filtered) {
      for (const f of b.floors) {
        for (const room of f.rooms) {
          rooms++;
          if (room.occupants.length > 0) occupied++;
          people += room.occupants.length;
        }
      }
    }
    return { rooms, occupied, people };
  }, [filtered]);

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 print:static">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="flex items-center gap-2">
            <Hotel className="size-5 text-primary" />
            <h1 className="text-base font-semibold sm:text-lg">
              2026 ECKCM UPJ Lodging Assignments
            </h1>
            <div className="ml-auto flex items-center gap-2 print:hidden">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleExport}
                disabled={exporting}
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
                className="gap-1.5"
                onClick={() => window.print()}
              >
                <Printer className="size-3.5" />
                Print
              </Button>
            </div>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Representative + member 1 per room · Generated {generatedAt} ET
          </p>

          {/* Controls */}
          <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
            <div className="flex flex-wrap gap-1">
              <FilterChip
                active={buildingFilter === "ALL"}
                onClick={() => setBuildingFilter("ALL")}
              >
                All
              </FilterChip>
              {buildings.map((b) => (
                <FilterChip
                  key={b.code}
                  active={buildingFilter === b.code}
                  onClick={() => setBuildingFilter(b.code)}
                >
                  {b.name}
                </FilterChip>
              ))}
            </div>

            <SearchInput
              placeholder="Search room or name…"
              value={search}
              onValueChange={setSearch}
              containerClassName="h-9 w-full max-w-xs sm:ml-auto"
              className="text-sm"
            />

            <Button
              variant={occupiedOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setOccupiedOnly((v) => !v)}
            >
              Occupied only
            </Button>
          </div>

          {/* Stats */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground">{stats.rooms}</strong> rooms
            </span>
            <span>
              <strong className="text-foreground">{stats.occupied}</strong>{" "}
              occupied
            </span>
            <span>
              <strong className="text-foreground">{stats.people}</strong> people
            </span>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto max-w-5xl px-4 py-4">
        {filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No rooms match your filters.
          </p>
        ) : (
          filtered.map((building) => (
            <section key={building.code} className="mb-8">
              <div className="mb-2 flex items-center gap-2">
                <Building2 className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">{building.name}</h2>
              </div>
              {building.floors.map((floor) => (
                <FloorTable
                  key={`${building.code}-${floor.floor}`}
                  buildingName={building.name}
                  floor={floor}
                />
              ))}
            </section>
          ))
        )}
        <p className="pb-8 pt-2 text-center text-[11px] text-muted-foreground">
          Confidential — for UPJ staff use only.
        </p>
      </main>
      <Toaster richColors position="top-center" />
    </div>
  );
}

// ─── Floor table ────────────────────────────────────────────────

function FloorTable({
  buildingName,
  floor,
}: {
  buildingName: string;
  floor: PublicFloor;
}) {
  // One row per tracked occupant; empty rooms still get a single (blank) row so
  // vacancies are visible. Room # / Type print only on a room's first row.
  const rows: {
    room: PublicRoom;
    occupant: PublicOccupant | null;
    isFirstRow: boolean;
  }[] = [];

  for (const room of floor.rooms) {
    if (room.occupants.length === 0) {
      rows.push({ room, occupant: null, isFirstRow: true });
    } else {
      room.occupants.forEach((occupant, i) => {
        rows.push({ room, occupant, isFirstRow: i === 0 });
      });
    }
  }

  return (
    <div className="mb-4 overflow-hidden rounded-md border">
      <div className="border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
        {buildingName} — Floor {floor.floor}{" "}
        <span className="font-normal">({floor.rooms.length} rooms)</span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20">
              <TableHead className="w-24">Room #</TableHead>
              <TableHead className="w-20">Type</TableHead>
              <TableHead className="w-36">First Name</TableHead>
              <TableHead className="w-36">Last Name</TableHead>
              <TableHead className="w-24">Arrival</TableHead>
              <TableHead className="w-24">Departure</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow
                key={`${row.room.roomNumber}-${idx}`}
                className={cn(
                  !row.room.isAvailable && "opacity-40",
                  row.isFirstRow && idx > 0 && "border-t-2",
                )}
              >
                <TableCell
                  className={cn(
                    "py-2 font-mono text-xs",
                    row.isFirstRow && "font-medium",
                  )}
                >
                  {row.isFirstRow ? row.room.roomNumber : ""}
                </TableCell>
                <TableCell className="py-2 text-xs text-muted-foreground">
                  {row.isFirstRow ? row.room.type : ""}
                </TableCell>
                <TableCell className="py-2 text-xs font-medium">
                  {row.occupant?.firstName ?? ""}
                </TableCell>
                <TableCell className="py-2 text-xs">
                  {row.occupant?.lastName ?? ""}
                </TableCell>
                <TableCell className="py-2 text-xs text-muted-foreground">
                  {formatDate(row.occupant?.arrival)}
                </TableCell>
                <TableCell className="py-2 text-xs text-muted-foreground">
                  {formatDate(row.occupant?.departure)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Bits ───────────────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        badgeVariants({ variant: active ? "default" : "outline" }),
        "cursor-pointer select-none",
      )}
    >
      {children}
    </button>
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
}
