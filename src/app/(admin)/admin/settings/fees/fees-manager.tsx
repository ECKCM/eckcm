"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime, useChangeDetector } from "@/lib/hooks/use-realtime";
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
import { logActivity } from "@/lib/audit-client";
import { useTableSort } from "@/lib/hooks/use-table-sort";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { MarkdownEditor } from "@/components/ui/markdown-editor";

type FeeTab = "all" | "GENERAL" | "LODGING" | "MEALS" | "FUNDING";

const CATEGORIES = ["GENERAL", "LODGING", "MEALS", "FUNDING"] as const;

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
  min_nights: number | null;
}

interface RegistrationGroup {
  id: string;
  name_en: string;
  name_ko: string | null;
  is_active: boolean;
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
  min_nights: "",
  // Funding-specific fields (stored in metadata)
  funding_group_id: "",
  sponsor_name: "",
  sponsor_contact: "",
  // Lodging agreement fields (stored in metadata)
  show_agreement: false,
  agreement_en: "",
  agreement_ko: "",
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
  const [registrationGroups, setRegistrationGroups] = useState<RegistrationGroup[]>([]);
  const [agreementLang, setAgreementLang] = useState<"en" | "ko">("en");

  const loadRegistrationGroups = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_registration_groups")
      .select("id, name_en, name_ko, is_active")
      .eq("is_active", true)
      .order("sort_order");
    setRegistrationGroups(data ?? []);
  }, []);

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
    loadRegistrationGroups();
  }, [loadFees, loadRegistrationGroups]);

  // Live updates
  const _reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime({ table: "eckcm_fee_categories", event: "*" }, () => {
    if (_reloadTimer.current) clearTimeout(_reloadTimer.current);
    _reloadTimer.current = setTimeout(loadFees, 500);
  });
  useChangeDetector("eckcm_fee_categories", loadFees, 5000);

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
      min_nights: fee.min_nights != null ? fee.min_nights.toString() : "",
      funding_group_id: (fee.metadata?.registration_group_id as string) ?? "",
      sponsor_name: (fee.metadata?.sponsor_name as string) ?? "",
      sponsor_contact: (fee.metadata?.sponsor_contact as string) ?? "",
      show_agreement: (fee.metadata?.show_agreement as boolean) ?? false,
      agreement_en: (fee.metadata?.agreement_en as string) ?? "",
      agreement_ko: (fee.metadata?.agreement_ko as string) ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.code || !form.name_en) {
      toast.error("Code and Name are required");
      return;
    }
    if (form.category === "FUNDING" && !form.funding_group_id) {
      toast.error("Registration Group is required for Funding categories");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    // Build metadata
    const metadata: Record<string, unknown> = {};
    if (form.category === "FUNDING") {
      metadata.registration_group_id = form.funding_group_id;
      if (form.sponsor_name) metadata.sponsor_name = form.sponsor_name;
      if (form.sponsor_contact) metadata.sponsor_contact = form.sponsor_contact;
    }
    if (form.category === "LODGING") {
      metadata.show_agreement = form.show_agreement;
      if (form.show_agreement) {
        metadata.agreement_en = form.agreement_en;
        metadata.agreement_ko = form.agreement_ko;
      }
    }

    const payload = {
      code: form.code.toUpperCase(),
      category: form.category,
      name_en: form.name_en,
      name_ko: form.name_ko || null,
      pricing_type: form.category === "FUNDING" ? "FLAT" : form.pricing_type,
      amount_cents: parseInt(form.amount_cents) || 0,
      sort_order: parseInt(form.sort_order) || 0,
      is_active: form.is_active,
      age_min: form.age_min ? parseInt(form.age_min) : null,
      age_max: form.age_max ? parseInt(form.age_max) : null,
      is_inventory_trackable: form.is_inventory_trackable,
      min_nights: form.min_nights ? parseInt(form.min_nights) : null,
      metadata,
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
      logActivity({ action: "UPDATE", entity_type: "fee_category", entity_id: editingId, new_data: payload });
    } else {
      const { data: created, error } = await supabase
        .from("eckcm_fee_categories")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Fee category created");
      logActivity({ action: "CREATE", entity_type: "fee_category", entity_id: created?.id, new_data: payload });
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
    logActivity({ action: "DELETE", entity_type: "fee_category", entity_id: id });
    loadFees();
  };

  const filteredFees = activeTab === "all"
    ? fees
    : fees.filter((f) => f.category === activeTab);

  const { sortedData: sorted, sortConfig, requestSort } = useTableSort(filteredFees);

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
            <TabsTrigger value="FUNDING">Funding</TabsTrigger>
          </TabsList>
        </Tabs>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              New Fee
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
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
              {form.category === "FUNDING" ? (
                <>
                  {/* Funding: Registration Group + Amount */}
                  <div className="space-y-1">
                    <Label>Target Registration Group *</Label>
                    <Select
                      value={form.funding_group_id}
                      onValueChange={(v) =>
                        setForm({ ...form, funding_group_id: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a group..." />
                      </SelectTrigger>
                      <SelectContent>
                        {registrationGroups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name_en}{g.name_ko ? ` (${g.name_ko})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Funding per Registration (cents)</Label>
                      <Input
                        type="number"
                        value={form.amount_cents}
                        onChange={(e) =>
                          setForm({ ...form, amount_cents: e.target.value })
                        }
                        placeholder="5000 = $50"
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
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label>Sponsor Name</Label>
                      <Input
                        value={form.sponsor_name}
                        onChange={(e) =>
                          setForm({ ...form, sponsor_name: e.target.value })
                        }
                        placeholder="e.g. HANSAMO"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Sponsor Contact</Label>
                      <Input
                        value={form.sponsor_contact}
                        onChange={(e) =>
                          setForm({ ...form, sponsor_contact: e.target.value })
                        }
                        placeholder="Email or phone"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Min Nights</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.min_nights}
                        onChange={(e) =>
                          setForm({ ...form, min_nights: e.target.value })
                        }
                        placeholder="No minimum"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
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
                  <div className="grid grid-cols-3 gap-3">
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
                    <div className="space-y-1">
                      <Label>Min Nights</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.min_nights}
                        onChange={(e) =>
                          setForm({ ...form, min_nights: e.target.value })
                        }
                        placeholder="No minimum"
                      />
                    </div>
                  </div>
                </>
              )}
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

              {/* Lodging Agreement — per fee category */}
              {form.category === "LODGING" && (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Lodging Agreement</Label>
                      <p className="text-xs text-muted-foreground">
                        Shown on Step 4 — users must agree before proceeding
                      </p>
                    </div>
                    <Switch
                      checked={form.show_agreement}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, show_agreement: checked })
                      }
                    />
                  </div>
                  {form.show_agreement && (
                    <div className="space-y-2">
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant={agreementLang === "en" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setAgreementLang("en")}
                        >
                          English
                        </Button>
                        <Button
                          type="button"
                          variant={agreementLang === "ko" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setAgreementLang("ko")}
                        >
                          Korean
                        </Button>
                      </div>
                      {agreementLang === "en" ? (
                        <MarkdownEditor
                          value={form.agreement_en}
                          onChange={(val) => setForm({ ...form, agreement_en: val })}
                          height={200}
                          placeholder="Enter English lodging agreement (Markdown)..."
                        />
                      ) : (
                        <MarkdownEditor
                          value={form.agreement_ko}
                          onChange={(val) => setForm({ ...form, agreement_ko: val })}
                          height={200}
                          placeholder="Korean 숙소 동의서 내용 입력 (Markdown)..."
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

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
              <SortableTableHead sortKey="code" sortConfig={sortConfig} onSort={requestSort}>Code</SortableTableHead>
              <SortableTableHead sortKey="name_en" sortConfig={sortConfig} onSort={requestSort}>Name</SortableTableHead>
              <SortableTableHead sortKey="fee_type" sortConfig={sortConfig} onSort={requestSort}>Type</SortableTableHead>
              <SortableTableHead sortKey="amount_cents" sortConfig={sortConfig} onSort={requestSort}>Amount</SortableTableHead>
              <SortableTableHead sortKey="age_group" sortConfig={sortConfig} onSort={requestSort}>{activeTab === "FUNDING" ? "Target Group" : "Age"}</SortableTableHead>
              <SortableTableHead sortKey="is_active" sortConfig={sortConfig} onSort={requestSort}>Status</SortableTableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-8"
                >
                  {activeTab === "all" ? "No fee categories yet." : `No ${activeTab.toLowerCase()} fee categories.`}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((fee) => (
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
                    {fee.category === "FUNDING" ? (
                      <div>
                        {registrationGroups.find((g) => g.id === fee.metadata?.registration_group_id)?.name_en ?? "—"}
                        {fee.metadata?.sponsor_name ? (
                          <p className="text-xs text-muted-foreground">Sponsor: {String(fee.metadata.sponsor_name)}</p>
                        ) : null}
                        {fee.min_nights != null && (
                          <p className="text-xs text-muted-foreground">≥{fee.min_nights} nights</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        {fee.age_min != null || fee.age_max != null
                          ? `Age ${fee.age_min ?? "0"}–${fee.age_max ?? "∞"}`
                          : "—"}
                        {fee.min_nights != null && (
                          <p className="text-xs text-muted-foreground">≥{fee.min_nights} nights</p>
                        )}
                      </div>
                    )}
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
                      {fee.metadata?.show_agreement === true && (
                        <Badge variant="outline">Agreement</Badge>
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
