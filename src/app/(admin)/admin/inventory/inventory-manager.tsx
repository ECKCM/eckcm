"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, RefreshCw, Plus } from "lucide-react";

interface Event {
  id: string;
  name_en: string;
  year: number;
}

interface InventoryRow {
  id: string;
  fee_category_id: string;
  fee_category_code: string;
  fee_category_name: string;
  total_quantity: number;
  held: number;
  reserved: number;
}

interface TrackableCategory {
  id: string;
  code: string;
  name_en: string;
}

export function InventoryManager({ events }: { events: Event[] }) {
  const [mounted, setMounted] = useState(false);
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [addableCategories, setAddableCategories] = useState<TrackableCategory[]>([]);
  const [adding, setAdding] = useState(false);

  const loadInventory = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("eckcm_fee_category_inventory")
      .select(
        `
        id, total_quantity, held, reserved,
        eckcm_fee_categories!inner(code, name_en, is_inventory_trackable)
      `
      )
      .eq("event_id", eventId)
      .eq("eckcm_fee_categories.is_inventory_trackable", true)
      .order("created_at");

    if (error) {
      toast.error("Failed to load inventory: " + error.message);
      setLoading(false);
      return;
    }

    const inventoryRows = (data ?? []).map((row: any) => ({
      id: row.id,
      fee_category_id: "", // not needed for display
      fee_category_code: row.eckcm_fee_categories.code,
      fee_category_name: row.eckcm_fee_categories.name_en,
      total_quantity: row.total_quantity,
      held: row.held,
      reserved: row.reserved,
    }));
    setRows(inventoryRows);

    // Load trackable categories not yet in inventory for this event
    const { data: allTrackable } = await supabase
      .from("eckcm_fee_categories")
      .select("id, code, name_en")
      .eq("is_inventory_trackable", true)
      .eq("is_active", true);

    const existingCodes = new Set(inventoryRows.map((r: InventoryRow) => r.fee_category_code));
    setAddableCategories(
      (allTrackable ?? []).filter((c: TrackableCategory) => !existingCodes.has(c.code))
    );

    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    setMounted(true);
    loadInventory();
  }, [loadInventory]);

  const handleStartEdit = (row: InventoryRow) => {
    setEditingId(row.id);
    setEditValue(String(row.total_quantity));
  };

  const handleSaveTotal = async (id: string) => {
    const newTotal = parseInt(editValue, 10);
    if (isNaN(newTotal) || newTotal < 0) {
      toast.error("Please enter a valid non-negative number");
      return;
    }

    const row = rows.find((r) => r.id === id);
    if (row && newTotal < row.held + row.reserved) {
      toast.error(
        `Total cannot be less than held + reserved (${row.held + row.reserved})`
      );
      return;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("eckcm_fee_category_inventory")
      .update({ total_quantity: newTotal })
      .eq("id", id);

    if (error) {
      toast.error("Failed to update: " + error.message);
      return;
    }

    toast.success("Total updated");
    setEditingId(null);
    loadInventory();
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter") {
      handleSaveTotal(id);
    } else if (e.key === "Escape") {
      setEditingId(null);
    }
  };

  const handleAddCategory = async (categoryId: string) => {
    if (!eventId) return;
    setAdding(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("eckcm_fee_category_inventory")
      .insert({
        event_id: eventId,
        fee_category_id: categoryId,
        total_quantity: 0,
      });
    if (error) {
      toast.error("Failed to add: " + error.message);
    } else {
      toast.success("Category added to inventory");
      loadInventory();
    }
    setAdding(false);
  };

  const getAvailable = (row: InventoryRow) =>
    row.total_quantity - row.held - row.reserved;

  const getStatusVariant = (row: InventoryRow) => {
    const available = getAvailable(row);
    if (row.total_quantity === 0) return "secondary" as const;
    const pct = available / row.total_quantity;
    if (pct > 0.5) return "default" as const;
    if (pct > 0.2) return "outline" as const;
    return "destructive" as const;
  };

  const getStatusLabel = (row: InventoryRow) => {
    const available = getAvailable(row);
    if (row.total_quantity === 0) return "Not Set";
    const pct = Math.round((available / row.total_quantity) * 100);
    if (available <= 0) return "Sold Out";
    return `${pct}% Available`;
  };

  if (!mounted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fee Category Inventory</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Fee Category Inventory</CardTitle>
          <div className="flex items-center gap-3">
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger className="w-[280px]">
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
            {addableCategories.length > 0 && (
              <Select
                onValueChange={handleAddCategory}
                disabled={adding}
              >
                <SelectTrigger className="w-[200px]">
                  <div className="flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Category</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {addableCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name_en} ({cat.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={loadInventory}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading inventory...
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">
            No inventory records found for this event.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fee Category</TableHead>
                <TableHead className="text-center w-[100px]">Total</TableHead>
                <TableHead className="text-center w-[80px]">Held</TableHead>
                <TableHead className="text-center w-[80px]">Reserved</TableHead>
                <TableHead className="text-center w-[80px]">Available</TableHead>
                <TableHead className="text-center w-[120px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const available = getAvailable(row);
                const isEditing = editingId === row.id;

                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{row.fee_category_name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {row.fee_category_code}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {isEditing ? (
                        <Input
                          type="number"
                          min={0}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleSaveTotal(row.id)}
                          onKeyDown={(e) => handleKeyDown(e, row.id)}
                          className="w-20 mx-auto text-center h-8"
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStartEdit(row)}
                          className="cursor-pointer hover:bg-muted rounded px-2 py-1 transition-colors"
                          title="Click to edit"
                        >
                          {row.total_quantity}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{row.held}</TableCell>
                    <TableCell className="text-center">{row.reserved}</TableCell>
                    <TableCell className="text-center font-semibold">
                      {available}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={getStatusVariant(row)}>
                        {getStatusLabel(row)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
