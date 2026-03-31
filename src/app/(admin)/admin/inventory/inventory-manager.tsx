"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime, useChangeDetector } from "@/lib/hooks/use-realtime";
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
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, RefreshCw, Plus, OctagonX, Play } from "lucide-react";
import { useTableSort } from "@/lib/hooks/use-table-sort";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
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

interface InventoryRow {
  id: string;
  fee_category_code: string;
  fee_category_name: string;
  total_quantity: number;
  held: number;
  reserved: number;
  is_force_stopped: boolean;
}

interface TrackableCategory {
  id: string;
  code: string;
  name_en: string;
}

export function InventoryManager() {
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [addableCategories, setAddableCategories] = useState<TrackableCategory[]>([]);
  const [adding, setAdding] = useState(false);
  const [stopConfirm, setStopConfirm] = useState<{
    row: InventoryRow;
    action: "stop" | "resume";
  } | null>(null);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("eckcm_fee_category_inventory")
      .select(
        `
        id, total_quantity, held, reserved, is_force_stopped,
        eckcm_fee_categories!inner(code, name_en, is_inventory_trackable)
      `
      )
      .eq("eckcm_fee_categories.is_inventory_trackable", true)
      .order("created_at");

    if (error) {
      toast.error("Failed to load inventory: " + error.message);
      setLoading(false);
      return;
    }

    const inventoryRows = (data ?? []).map((row: any) => ({
      id: row.id,
      fee_category_code: row.eckcm_fee_categories.code,
      fee_category_name: row.eckcm_fee_categories.name_en,
      total_quantity: row.total_quantity,
      held: row.held,
      reserved: row.reserved,
      is_force_stopped: row.is_force_stopped ?? false,
    }));
    setRows(inventoryRows);

    // Load trackable categories not yet in inventory
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
  }, []);

  useEffect(() => {
    setMounted(true);
    loadInventory();
  }, [loadInventory]);

  // Live updates
  const _reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime({ table: "eckcm_fee_category_inventory", event: "*" }, () => {
    if (_reloadTimer.current) clearTimeout(_reloadTimer.current);
    _reloadTimer.current = setTimeout(loadInventory, 500);
  });
  useChangeDetector("eckcm_fee_category_inventory", loadInventory, 5000);

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
    setAdding(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("eckcm_fee_category_inventory")
      .insert({
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

  const handleToggleForceStop = async () => {
    if (!stopConfirm) return;
    const { row, action } = stopConfirm;
    const newValue = action === "stop";
    const supabase = createClient();
    const { error } = await supabase
      .from("eckcm_fee_category_inventory")
      .update({ is_force_stopped: newValue })
      .eq("id", row.id);
    if (error) {
      toast.error("Failed to update: " + error.message);
    } else {
      toast.success(
        newValue
          ? `${row.fee_category_name} stopped`
          : `${row.fee_category_name} resumed`
      );
      loadInventory();
    }
    setStopConfirm(null);
  };

  const getAvailable = (row: InventoryRow) =>
    row.total_quantity - row.held - row.reserved;

  const getStatusVariant = (row: InventoryRow) => {
    if (row.is_force_stopped) return "destructive" as const;
    const available = getAvailable(row);
    if (row.total_quantity === 0) return "secondary" as const;
    const pct = available / row.total_quantity;
    if (pct > 0.5) return "default" as const;
    if (pct > 0.2) return "outline" as const;
    return "destructive" as const;
  };

  const getStatusLabel = (row: InventoryRow) => {
    if (row.is_force_stopped) return "STOPPED";
    const available = getAvailable(row);
    if (row.total_quantity === 0) return "Not Set";
    const pct = Math.round((available / row.total_quantity) * 100);
    if (available <= 0) return "Sold Out";
    return `${pct}% Available`;
  };

  const { sortedData: sortedRows, sortConfig, requestSort } = useTableSort(rows);

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
        {loading && sortedRows.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading inventory...
          </div>
        ) : sortedRows.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">
            No inventory records found.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="fee_category_name" sortConfig={sortConfig} onSort={requestSort}>Fee Category</SortableTableHead>
                <SortableTableHead className="text-center w-[100px]" sortKey="total_quantity" sortConfig={sortConfig} onSort={requestSort}>Total</SortableTableHead>
                <SortableTableHead className="text-center w-[80px]" sortKey="held" sortConfig={sortConfig} onSort={requestSort}>Held</SortableTableHead>
                <SortableTableHead className="text-center w-[80px]" sortKey="reserved" sortConfig={sortConfig} onSort={requestSort}>Reserved</SortableTableHead>
                <SortableTableHead className="text-center w-[80px]" sortKey="available_quantity" sortConfig={sortConfig} onSort={requestSort}>Available</SortableTableHead>
                <SortableTableHead className="text-center w-[120px]" sortKey="status" sortConfig={sortConfig} onSort={requestSort}>Status</SortableTableHead>
                <SortableTableHead className="text-center w-[100px]" sortKey="is_force_stopped" sortConfig={sortConfig} onSort={requestSort}>Action</SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => {
                const available = getAvailable(row);
                const isEditing = editingId === row.id;

                return (
                  <TableRow key={row.id} className={row.is_force_stopped ? "opacity-60" : ""}>
                    <TableCell>
                      <div className="flex items-center">
                        <span className="font-medium">{row.fee_category_name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {row.fee_category_code}
                        </span>
                        {row.is_force_stopped && (
                          <Badge variant="destructive" className="ml-2 text-[10px]">STOPPED</Badge>
                        )}
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
                          className="cursor-pointer hover:bg-muted active:bg-muted/70 active:scale-95 rounded px-2 py-1 transition-colors"
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
                    <TableCell className="text-center">
                      {row.is_force_stopped ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setStopConfirm({ row, action: "resume" })}
                          className="h-7 text-xs"
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Resume
                        </Button>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setStopConfirm({ row, action: "stop" })}
                          className="h-7 text-xs"
                        >
                          <OctagonX className="h-3 w-3 mr-1" />
                          STOP
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AlertDialog open={!!stopConfirm} onOpenChange={(open) => !open && setStopConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {stopConfirm?.action === "stop"
                ? `Force-stop ${stopConfirm?.row.fee_category_name}?`
                : `Resume ${stopConfirm?.row.fee_category_name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {stopConfirm?.action === "stop"
                ? "New registrations will not be able to select this option. Existing registrations are not affected."
                : "This option will become available for new registrations again (subject to inventory availability)."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleForceStop}
              className={
                stopConfirm?.action === "stop"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
            >
              {stopConfirm?.action === "stop" ? "Force Stop" : "Resume"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
