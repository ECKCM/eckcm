"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface FeeCategory {
  id: string;
  event_id: string;
  code: string;
  name_en: string;
  name_ko: string | null;
  pricing_type: string;
  amount_cents: number;
  metadata: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
}

const PRICING_TYPES = ["FLAT", "PER_NIGHT", "PER_MEAL", "TIERED"];

const emptyForm = {
  code: "",
  name_en: "",
  name_ko: "",
  pricing_type: "FLAT",
  amount_cents: "",
  sort_order: "0",
  is_active: true,
};

export function FeeCategoriesManager({
  events,
}: {
  events: { id: string; name_en: string; year: number }[];
}) {
  const [selectedEventId, setSelectedEventId] = useState("");
  const [fees, setFees] = useState<FeeCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const loadFees = useCallback(async (eventId: string) => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_fee_categories")
      .select("*")
      .eq("event_id", eventId)
      .order("sort_order");
    setFees(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      loadFees(selectedEventId);
    }
  }, [selectedEventId, loadFees]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (fee: FeeCategory) => {
    setEditingId(fee.id);
    setForm({
      code: fee.code,
      name_en: fee.name_en,
      name_ko: fee.name_ko ?? "",
      pricing_type: fee.pricing_type,
      amount_cents: fee.amount_cents.toString(),
      sort_order: fee.sort_order.toString(),
      is_active: fee.is_active,
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
      event_id: selectedEventId,
      code: form.code.toUpperCase(),
      name_en: form.name_en,
      name_ko: form.name_ko || null,
      pricing_type: form.pricing_type,
      amount_cents: parseInt(form.amount_cents) || 0,
      sort_order: parseInt(form.sort_order) || 0,
      is_active: form.is_active,
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
    loadFees(selectedEventId);
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
    loadFees(selectedEventId);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-64">
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger>
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
        {selectedEventId && (
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
                <div className="grid grid-cols-2 gap-3">
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
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, is_active: checked })
                    }
                  />
                  <Label>Active</Label>
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
        )}
      </div>

      {!selectedEventId ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Select an event to manage fee categories.
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Loading...
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fees.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground py-8"
                >
                  No fee categories yet.
                </TableCell>
              </TableRow>
            ) : (
              fees.map((fee) => (
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
                  <TableCell>
                    <Badge
                      variant={fee.is_active ? "default" : "secondary"}
                    >
                      {fee.is_active ? "Active" : "Inactive"}
                    </Badge>
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
                      onClick={() => handleDelete(fee.id)}
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
    </div>
  );
}
