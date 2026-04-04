"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime, useChangeDetector } from "@/lib/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
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
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  DollarSign,
  RefreshCw,
  Undo2,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";
import { RegistrationCodeCombobox } from "@/components/shared/registration-code-combobox";

interface ManualPayment {
  id: string;
  payment_type: "zelle" | "check";
  status: "received" | "updated" | "refunded" | "partially_refunded";
  registration_code: string | null;
  first_name: string;
  last_name: string;
  amount_cents: number;
  refunded_cents: number;
  date_received: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

const emptyForm = {
  registration_code: "",
  first_name: "",
  last_name: "",
  amount: "",
  date_received: "",
  note: "",
};

function formatCents(cents: number): string {
  return `$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format date string (YYYY-MM-DD or ISO) as "MM. DD. YYYY" */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}. ${dd}. ${yyyy}`;
}

/** YYYY-MM-DD string for today */
function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

/** Parse YYYY-MM-DD to Date (local timezone) */
function isoToDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  return new Date(iso + "T00:00:00");
}

/** Date object to YYYY-MM-DD */
function dateToIso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function statusBadge(status: string) {
  switch (status) {
    case "received":
      return <Badge variant="default">Received</Badge>;
    case "updated":
      return <Badge className="bg-green-600 hover:bg-green-700 text-white">Updated</Badge>;
    case "partially_refunded":
      return <Badge className="bg-orange-600 hover:bg-orange-700 text-white">Partial Refund</Badge>;
    case "refunded":
      return <Badge variant="destructive">Refunded</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function typeBadge(type: string) {
  if (type === "zelle") {
    return <Badge className="bg-purple-600 hover:bg-purple-700 text-white">Zelle</Badge>;
  }
  return <Badge className="bg-blue-600 hover:bg-blue-700 text-white">Check</Badge>;
}

export function ManualPaymentsManager() {
  const [payments, setPayments] = useState<ManualPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"zelle" | "check">("zelle");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [refundTarget, setRefundTarget] = useState<ManualPayment | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundSaving, setRefundSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManualPayment | null>(null);
  const [registrationCodes, setRegistrationCodes] = useState<string[]>([]);
  // Edit mode
  const [editTarget, setEditTarget] = useState<ManualPayment | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editSaving, setEditSaving] = useState(false);

  // Load existing registration codes
  const loadRegistrationCodes = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_registrations")
      .select("confirmation_code")
      .not("confirmation_code", "is", null)
      .order("confirmation_code");

    if (data) {
      setRegistrationCodes(
        data
          .map((r) => r.confirmation_code)
          .filter((code): code is string => !!code)
      );
    }
  }, []);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/manual-payments", {
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        setPayments(json.payments ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
    loadRegistrationCodes();
  }, [loadPayments, loadRegistrationCodes]);

  // Live updates
  const _reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime({ table: "eckcm_manual_payments", event: "*" }, () => {
    if (_reloadTimer.current) clearTimeout(_reloadTimer.current);
    _reloadTimer.current = setTimeout(loadPayments, 500);
  });
  useChangeDetector("eckcm_manual_payments", loadPayments, 5000);

  // Summary stats
  const stats = useMemo(() => {
    const active = payments.filter((p) => p.status !== "refunded");
    const zelleTotal = active.filter((p) => p.payment_type === "zelle").reduce((s, p) => s + (p.amount_cents - (p.refunded_cents ?? 0)), 0);
    const checkTotal = active.filter((p) => p.payment_type === "check").reduce((s, p) => s + (p.amount_cents - (p.refunded_cents ?? 0)), 0);
    const refundedTotal = payments.reduce((s, p) => s + (p.refunded_cents ?? 0), 0);
    return { total: active.length, zelleTotal, checkTotal, refundedTotal };
  }, [payments]);

  // Filtered list
  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (typeFilter !== "all" && p.payment_type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !p.first_name.toLowerCase().includes(q) &&
          !p.last_name.toLowerCase().includes(q) &&
          !(p.registration_code ?? "").toLowerCase().includes(q) &&
          !(p.note ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [payments, search, statusFilter, typeFilter]);

  const openDialog = (type: "zelle" | "check") => {
    setDialogType(type);
    setForm({ ...emptyForm, date_received: todayIso() });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.amount || !form.date_received) {
      toast.error("First name, last name, amount, and date received are required");
      return;
    }

    const amountCents = Math.round(parseFloat(form.amount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      toast.error("Please enter a valid positive amount");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/manual-payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({
          payment_type: dialogType,
          registration_code: form.registration_code || null,
          first_name: form.first_name,
          last_name: form.last_name,
          amount_cents: amountCents,
          date_received: form.date_received,
          note: form.note || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to save");
        return;
      }

      toast.success(`${dialogType === "zelle" ? "Zelle" : "Check"} payment added`);
      setDialogOpen(false);
      loadPayments();
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: "received" | "updated" | "refunded") => {
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/manual-payments", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session?.access_token}`,
      },
      body: JSON.stringify({ id, status }),
    });

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error || "Failed to update");
      return;
    }

    toast.success(`Status updated to ${status}`);
    loadPayments();
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/manual-payments", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session?.access_token}`,
      },
      body: JSON.stringify({ id }),
    });

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error || "Failed to delete");
      return;
    }

    toast.success("Payment deleted");
    loadPayments();
  };

  // --- Edit row ---
  const openEdit = (p: ManualPayment) => {
    setEditTarget(p);
    setEditForm({
      registration_code: p.registration_code ?? "",
      first_name: p.first_name,
      last_name: p.last_name,
      amount: (p.amount_cents / 100).toFixed(2),
      date_received: p.date_received,
      note: p.note ?? "",
    });
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    if (!editForm.first_name || !editForm.last_name || !editForm.amount || !editForm.date_received) {
      toast.error("First name, last name, amount, and date received are required");
      return;
    }

    const amountCents = Math.round(parseFloat(editForm.amount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      toast.error("Please enter a valid positive amount");
      return;
    }

    setEditSaving(true);
    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/manual-payments", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({
          id: editTarget.id,
          registration_code: editForm.registration_code || null,
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          amount_cents: amountCents,
          date_received: editForm.date_received,
          note: editForm.note || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to update");
        return;
      }

      toast.success("Payment updated");
      setEditTarget(null);
      loadPayments();
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Total Active</p>
              <p className="text-xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="h-3 w-3 rounded-full bg-purple-600" />
            <div>
              <p className="text-sm text-muted-foreground">Zelle</p>
              <p className="text-xl font-bold">{formatCents(stats.zelleTotal)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="h-3 w-3 rounded-full bg-blue-600" />
            <div>
              <p className="text-sm text-muted-foreground">Check</p>
              <p className="text-xl font-bold">{formatCents(stats.checkTotal)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Undo2 className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm text-muted-foreground">Refunded</p>
              <p className="text-xl font-bold">{formatCents(stats.refundedTotal)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by name, code, or note..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="updated">Updated</SelectItem>
            <SelectItem value="partially_refunded">Partial Refund</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="zelle">Zelle</SelectItem>
            <SelectItem value="check">Check</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={loadPayments} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => openDialog("zelle")} className="bg-purple-600 hover:bg-purple-700">
            <Plus className="mr-1 h-4 w-4" /> Add Zelle
          </Button>
          <Button onClick={() => openDialog("check")} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-1 h-4 w-4" /> Add Check
          </Button>
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-md border overflow-scroll max-h-[calc(100vh-320px)] [&::-webkit-scrollbar]:block [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:bg-muted/30 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/60 [&::-webkit-scrollbar-corner]:bg-transparent" style={{ scrollbarGutter: "stable" }}>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead>Reg. Code</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-[90px]">Type</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Date Received</TableHead>
              <TableHead className="text-right w-[80px]">Created</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  No payments found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p, i) => (
                <TableRow key={p.id} className={p.status === "refunded" ? "opacity-50" : ""}>
                  <TableCell className="text-muted-foreground text-xs font-mono">
                    {String(i + 1).padStart(3, "0")}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {p.registration_code || "—"}
                  </TableCell>
                  <TableCell>{statusBadge(p.status)}</TableCell>
                  <TableCell>
                    {p.first_name} {p.last_name}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <div>{formatCents(p.amount_cents)}</div>
                    {(p.refunded_cents ?? 0) > 0 && (
                      <div className="text-xs text-destructive">
                        -{formatCents(p.refunded_cents)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{typeBadge(p.payment_type)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {p.note || "—"}
                  </TableCell>
                  <TableCell>{formatDate(p.date_received)}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatDate(p.created_at)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {p.status !== "refunded" && p.status !== "partially_refunded" && (
                          <DropdownMenuItem onClick={() => openEdit(p)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {p.status !== "updated" && p.status !== "refunded" && p.status !== "partially_refunded" && (
                          <DropdownMenuItem onClick={() => updateStatus(p.id, "updated")}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Mark as Updated
                          </DropdownMenuItem>
                        )}
                        {p.status !== "received" && p.status !== "refunded" && p.status !== "partially_refunded" && (
                          <DropdownMenuItem onClick={() => updateStatus(p.id, "received")}>
                            <DollarSign className="mr-2 h-4 w-4" />
                            Mark as Received
                          </DropdownMenuItem>
                        )}
                        {p.status !== "refunded" && (
                          <DropdownMenuItem
                            onClick={() => {
                              const remaining = p.amount_cents - (p.refunded_cents ?? 0);
                              setRefundTarget(p);
                              setRefundAmount((remaining / 100).toFixed(2));
                            }}
                            className="text-destructive"
                          >
                            <Undo2 className="mr-2 h-4 w-4" />
                            {p.status === "partially_refunded" ? "Refund More" : "Refund"}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(p)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Payment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              Add {dialogType === "zelle" ? "Zelle" : "Check"} Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Registration Code */}
            <div className="space-y-1.5">
              <Label>Registration Code</Label>
              <RegistrationCodeCombobox
                codes={registrationCodes}
                value={form.registration_code}
                onValueChange={(v) => setForm((f) => ({ ...f, registration_code: v }))}
              />
              <p className="text-xs text-muted-foreground">
                Optional — type manually or pick from existing registrations
              </p>
            </div>

            {/* Name fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name *</Label>
                <Input
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  placeholder="John"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name *</Label>
                <Input
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  placeholder="Doe"
                />
              </div>
            </div>

            {/* Amount and Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount Received ($) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date Received *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !form.date_received && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.date_received ? formatDate(form.date_received) : "MM. DD. YYYY"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={isoToDate(form.date_received)}
                      onSelect={(date) => {
                        if (date) setForm((f) => ({ ...f, date_received: dateToIso(date) }));
                      }}
                      defaultMonth={isoToDate(form.date_received)}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Optional note..."
                rows={2}
              />
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? "Saving..." : `Add ${dialogType === "zelle" ? "Zelle" : "Check"} Payment`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Payment Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Edit Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Registration Code</Label>
              <RegistrationCodeCombobox
                codes={registrationCodes}
                value={editForm.registration_code}
                onValueChange={(v) => setEditForm((f) => ({ ...f, registration_code: v }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name *</Label>
                <Input
                  value={editForm.first_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, first_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name *</Label>
                <Input
                  value={editForm.last_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, last_name: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount Received ($) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editForm.amount}
                  onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date Received *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !editForm.date_received && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editForm.date_received ? formatDate(editForm.date_received) : "MM. DD. YYYY"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={isoToDate(editForm.date_received)}
                      onSelect={(date) => {
                        if (date) setEditForm((f) => ({ ...f, date_received: dateToIso(date) }));
                      }}
                      defaultMonth={isoToDate(editForm.date_received)}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea
                value={editForm.note}
                onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Optional note..."
                rows={2}
              />
            </div>

            <Button onClick={handleEditSave} disabled={editSaving} className="w-full">
              {editSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={!!refundTarget} onOpenChange={(open) => { if (!open) { setRefundTarget(null); setRefundAmount(""); } }}>
        <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Refund Payment</DialogTitle>
          </DialogHeader>
          {refundTarget && (() => {
            const alreadyRefunded = refundTarget.refunded_cents ?? 0;
            const remaining = refundTarget.amount_cents - alreadyRefunded;
            const refundCents = Math.round(parseFloat(refundAmount || "0") * 100);
            const isFullRefund = refundCents >= remaining;
            return (
              <div className="space-y-4">
                <div className="rounded-md border p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payee</span>
                    <span className="font-medium">{refundTarget.first_name} {refundTarget.last_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span>{refundTarget.payment_type === "zelle" ? "Zelle" : "Check"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Original Amount</span>
                    <span className="font-medium">{formatCents(refundTarget.amount_cents)}</span>
                  </div>
                  {alreadyRefunded > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>Already Refunded</span>
                      <span>-{formatCents(alreadyRefunded)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-1">
                    <span className="text-muted-foreground">Remaining</span>
                    <span className="font-bold">{formatCents(remaining)}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Refund Amount ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={(remaining / 100).toFixed(2)}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-muted-foreground">
                    Max: {formatCents(remaining)}
                    {isFullRefund && refundCents > 0 && " — This will be a full refund"}
                  </p>
                </div>

                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={refundSaving || !refundAmount || refundCents <= 0 || refundCents > remaining}
                  onClick={async () => {
                    if (!refundTarget || refundCents <= 0 || refundCents > remaining) return;
                    setRefundSaving(true);
                    try {
                      const supabase = createClient();
                      const { data: session } = await supabase.auth.getSession();
                      const res = await fetch("/api/admin/manual-payments", {
                        method: "PATCH",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${session.session?.access_token}`,
                        },
                        body: JSON.stringify({
                          id: refundTarget.id,
                          refund_amount_cents: refundCents,
                        }),
                      });

                      if (!res.ok) {
                        const err = await res.json();
                        toast.error(err.error || "Failed to refund");
                        return;
                      }

                      toast.success(
                        isFullRefund
                          ? `Full refund of ${formatCents(refundCents)} processed`
                          : `Partial refund of ${formatCents(refundCents)} processed`
                      );
                      setRefundTarget(null);
                      setRefundAmount("");
                      loadPayments();
                    } finally {
                      setRefundSaving(false);
                    }
                  }}
                >
                  {refundSaving ? "Processing..." : `Refund ${refundAmount && refundCents > 0 ? formatCents(refundCents) : ""}`}
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => {
          if (deleteTarget) {
            handleDelete(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        title="Delete Payment"
        description={
          deleteTarget
            ? `Are you sure you want to permanently delete the ${deleteTarget.payment_type === "zelle" ? "Zelle" : "Check"} payment of ${formatCents(deleteTarget.amount_cents)} from ${deleteTarget.first_name} ${deleteTarget.last_name}? This cannot be undone.`
            : ""
        }
      />
    </div>
  );
}
