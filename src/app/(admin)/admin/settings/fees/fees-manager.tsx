"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";

type FeeTab = "all" | "GENERAL" | "LODGING" | "MEALS";

const CATEGORIES = ["GENERAL", "LODGING", "MEALS"] as const;

interface FeeCategory {
  id: string;
  code: string;
  category: string;
  name_en: string;
  name_ko: string | null;
  pricing_type: string;
  amount_cents: number;
  metadata: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  age_min: number | null;
  age_max: number | null;
  is_inventory_trackable: boolean;
}

const PRICING_TYPES = ["FLAT", "PER_NIGHT", "PER_MEAL", "TIERED"];

const emptyForm = {
  code: "",
  category: "GENERAL",
  name_en: "",
  name_ko: "",
  pricing_type: "FLAT",
  amount_cents: "",
  sort_order: "0",
  is_active: true,
  age_min: "",
  age_max: "",
  is_inventory_trackable: false,
};

export function FeeCategoriesManager() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<FeeTab>("all");
  const [fees, setFees] = useState<FeeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const loadFees = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_fee_categories")
      .select("*")
      .order("category")
      .order("sort_order");
    setFees(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    setMounted(true);
    loadFees();
  }, [loadFees]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (fee: FeeCategory) => {
    setEditingId(fee.id);
    setForm({
      code: fee.code,
      category: fee.category,
      name_en: fee.name_en,
      name_ko: fee.name_ko ?? "",
      pricing_type: fee.pricing_type,
      amount_cents: fee.amount_cents.toString(),
      sort_order: fee.sort_order.toString(),
      is_active: fee.is_active,
      age_min: fee.age_min != null ? fee.age_min.toString() : "",
      age_max: fee.age_max != null ? fee.age_max.toString() : "",
      is_inventory_trackable: fee.is_inventory_trackable,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.code || !form.name_en) {
      toast.error("Code and Name are required");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const payload = {
      code: form.code.toUpperCase(),
      category: form.category,
      name_en: form.name_en,
      name_ko: form.name_ko || null,
      pricing_type: form.pricing_type,
      amount_cents: parseInt(form.amount_cents) || 0,
      sort_order: parseInt(form.sort_order) || 0,
      is_active: form.is_active,
      age_min: form.age_min ? parseInt(form.age_min) : null,
      age_max: form.age_max ? parseInt(form.age_max) : null,
      is_inventory_trackable: form.is_inventory_trackable,
    };

    if (editingId) {
      const { error } = await supabase
        .from("eckcm_fee_categories")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Fee category updated");
    } else {
      const { error } = await supabase
        .from("eckcm_fee_categories")
        .insert(payload);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Fee category created");
    }

    setSaving(false);
    setDialogOpen(false);
    loadFees();
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("eckcm_fee_categories")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Fee category deleted");
    loadFees();
  };

  const filteredFees = activeTab === "all"
    ? fees
    : fees.filter((f) => f.category === activeTab);

  if (!mounted) {
    return (
      <div className="space-y-4">
        <p className="text-center text-muted-foreground py-8">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FeeTab)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="GENERAL">General</TabsTrigger>
            <TabsTrigger value="LODGING">Lodging</TabsTrigger>
            <TabsTrigger value="MEALS">Meals</TabsTrigger>
          </TabsList>
        </Tabs>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              New Fee
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Edit Fee Category" : "Create Fee Category"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Code *</Label>
                  <Input
                    value={form.code}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        code: e.target.value.toUpperCase(),
                      })
                    }
                    placeholder="REG_FEE"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) =>
                      setForm({ ...form, category: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c.charAt(0) + c.slice(1).toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Name (EN) *</Label>
                  <Input
                    value={form.name_en}
                    onChange={(e) =>
                      setForm({ ...form, name_en: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Name (KO)</Label>
                  <Input
                    value={form.name_ko}
                    onChange={(e) =>
                      setForm({ ...form, name_ko: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Pricing Type</Label>
                  <Select
                    value={form.pricing_type}
                    onValueChange={(v) =>
                      setForm({ ...form, pricing_type: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRICING_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Amount (cents)</Label>
                  <Input
                    type="number"
                    value={form.amount_cents}
                    onChange={(e) =>
                      setForm({ ...form, amount_cents: e.target.value })
                    }
                    placeholder="15000 = $150"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) =>
                      setForm({ ...form, sort_order: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Age Min</Label>
                  <Input
                    type="number"
                    value={form.age_min}
                    onChange={(e) =>
                      setForm({ ...form, age_min: e.target.value })
                    }
                    placeholder="No minimum"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Age Max</Label>
                  <Input
                    type="number"
                    value={form.age_max}
                    onChange={(e) =>
                      setForm({ ...form, age_max: e.target.value })
                    }
                    placeholder="No maximum"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, is_active: checked })
                    }
                  />
                  <Label>Active</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.is_inventory_trackable}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, is_inventory_trackable: checked })
                    }
                  />
                  <Label>Inventory Trackable</Label>
                </div>
              </div>
              <Button
                onClick={handleSave}
                className="w-full"
                disabled={saving}
              >
                {saving ? "Saving..." : editingId ? "Update" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>


      {loading ? (
        <p className="text-center text-muted-foreground py-8">Loading...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFees.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-8"
                >
                  {activeTab === "all" ? "No fee categories yet." : `No ${activeTab.toLowerCase()} fee categories.`}
                </TableCell>
              </TableRow>
            ) : (
              filteredFees.map((fee) => (
                <TableRow key={fee.id}>
                  <TableCell className="font-mono text-sm">
                    {fee.code}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p>{fee.name_en}</p>
                      {fee.name_ko && (
                        <p className="text-sm text-muted-foreground">
                          {fee.name_ko}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{fee.pricing_type}</Badge>
                  </TableCell>
                  <TableCell>${(fee.amount_cents / 100).toFixed(2)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fee.age_min != null || fee.age_max != null
                      ? `${fee.age_min ?? "0"}–${fee.age_max ?? "∞"}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Badge
                        variant={fee.is_active ? "default" : "secondary"}
                      >
                        {fee.is_active ? "Active" : "Inactive"}
                      </Badge>
                      {fee.is_inventory_trackable && (
                        <Badge variant="outline">Inv</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(fee)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(fee.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
          setDeleteTarget(null);
        }}
        title="Delete fee category?"
        description="This will permanently delete this fee category. This action cannot be undone."
      />
    </div>
  );
}
