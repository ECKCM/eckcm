"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { ChevronDown, ChevronRight, DollarSign, Users, FileText, Plus, Trash2, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";
import { formatCurrency } from "@/lib/utils/formatters";

interface FundingSource {
  id: string;
  code: string;
  name_en: string;
  name_ko: string | null;
  amount_cents: number;
  is_active: boolean;
  metadata: {
    registration_group_id?: string;
    sponsor_name?: string;
    sponsor_contact?: string;
  };
  group_name: string;
  group_name_ko: string | null;
}

interface FundingAllocation {
  id: string;
  funding_fee_category_id: string;
  registration_id: string;
  event_id: string;
  registration_group_id: string;
  amount_cents: number;
  participant_count: number;
  created_at: string;
  eckcm_registrations: {
    confirmation_code: string;
    status: string;
  };
  representative_name: string;
  group_name: string;
}

interface ManualFunding {
  id: string;
  event_id: string | null;
  name: string;
  amount_cents: number;
  sponsor_name: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function formatCents(cents: number): string {
  return formatCurrency(Math.abs(cents));
}

/** Format date string (YYYY-MM-DD or ISO) as "MM. DD. YYYY" */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}. ${dd}. ${d.getFullYear()}`;
}

const emptyFundingForm = { name: "", amount: "", sponsor_name: "", note: "" };

export function FundingTracker() {
  const [sources, setSources] = useState<FundingSource[]>([]);
  const [allocations, setAllocations] = useState<FundingAllocation[]>([]);
  const [manualFunding, setManualFunding] = useState<ManualFunding[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);

  // Add custom funding dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyFundingForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManualFunding | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/funding", {
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        setSources(json.sources ?? []);
        setAllocations(json.allocations ?? []);
        setManualFunding(json.manualFunding ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddFunding = async () => {
    if (!form.name.trim() || !form.amount) {
      toast.error("Funding name and amount are required");
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
      const res = await fetch("/api/admin/funding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({
          name: form.name.trim(),
          amount_cents: amountCents,
          sponsor_name: form.sponsor_name.trim() || null,
          note: form.note.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to add funding");
        return;
      }
      toast.success("Custom funding added");
      setForm(emptyFundingForm);
      setDialogOpen(false);
      loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFunding = async (id: string) => {
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/funding", {
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
    toast.success("Custom funding deleted");
    loadData();
  };

  // Aggregate stats per funding source
  const statsMap = new Map<
    string,
    { totalAllocated: number; registrationCount: number; participantCount: number }
  >();
  for (const a of allocations) {
    const existing = statsMap.get(a.funding_fee_category_id) ?? {
      totalAllocated: 0,
      registrationCount: 0,
      participantCount: 0,
    };
    existing.totalAllocated += a.amount_cents;
    existing.registrationCount += 1;
    existing.participantCount += a.participant_count;
    statsMap.set(a.funding_fee_category_id, existing);
  }

  // Overall totals
  const activeSources = sources.filter((s) => s.is_active).length;
  const totalAllocated = allocations.reduce((sum, a) => sum + a.amount_cents, 0);
  const totalRegistrations = allocations.length;
  const totalManualFunding = manualFunding.reduce((sum, m) => sum + m.amount_cents, 0);

  if (loading) {
    return <p className="text-center text-muted-foreground py-8">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Add custom funding — always available, even before any FUNDING fee
          categories are configured. */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Custom Funding{" "}
          {manualFunding.length > 0 && (
            <span className="text-foreground font-semibold">
              · {formatCents(totalManualFunding)} ({manualFunding.length})
            </span>
          )}
        </h2>
        <Button onClick={() => { setForm(emptyFundingForm); setDialogOpen(true); }}>
          <Plus className="mr-1 h-4 w-4" /> Add Funding
        </Button>
      </div>

      {/* Custom funding entries */}
      {manualFunding.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funding Name</TableHead>
              <TableHead>Sponsor</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Recorded</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {manualFunding.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell>{m.sponsor_name || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-pre-wrap max-w-xs">
                  {m.note || "—"}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCents(m.amount_cents)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(m.created_at)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeleteTarget(m)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Per-registration funding sources (only when FUNDING fee categories exist) */}
      {sources.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 border rounded-md">
          <p>No per-registration funding sources configured.</p>
          <p className="text-sm mt-1">
            Create a fee category with category &quot;FUNDING&quot; in Settings &rarr; Fee Categories,
            or use &quot;Add Funding&quot; above to record a custom amount.
          </p>
        </div>
      ) : (
      <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Funding Sources</CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeSources}</div>
            <p className="text-xs text-muted-foreground">of {sources.length} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Allocated</CardTitle>
            <FileText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCents(totalAllocated)}</div>
            <p className="text-xs text-muted-foreground">
              across {totalRegistrations} registration{totalRegistrations !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">To Collect from Sponsors</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{formatCents(totalAllocated)}</div>
            <p className="text-xs text-muted-foreground">reimbursement pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Funding Sources Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Funding Name</TableHead>
            <TableHead>Sponsor</TableHead>
            <TableHead>Target Group</TableHead>
            <TableHead>Per Registration</TableHead>
            <TableHead>Registrations</TableHead>
            <TableHead>Total Allocated</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.map((source) => {
            const stats = statsMap.get(source.id) ?? {
              totalAllocated: 0,
              registrationCount: 0,
              participantCount: 0,
            };
            const sourceAllocations = allocations.filter(
              (a) => a.funding_fee_category_id === source.id
            );
            const isExpanded = expandedSource === source.id;

            return (
              <Fragment key={source.id}>
                <TableRow
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setExpandedSource(isExpanded ? null : source.id)}
                >
                  <TableCell>
                    {sourceAllocations.length > 0 && (
                      isExpanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )
                    )}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{source.name_en}</p>
                      {source.name_ko && (
                        <p className="text-sm text-muted-foreground">{source.name_ko}</p>
                      )}
                      <p className="text-xs text-muted-foreground font-mono">{source.code}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p>{source.metadata?.sponsor_name || "—"}</p>
                      {source.metadata?.sponsor_contact && (
                        <p className="text-xs text-muted-foreground">
                          {source.metadata.sponsor_contact}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p>{source.group_name}</p>
                      {source.group_name_ko && (
                        <p className="text-sm text-muted-foreground">{source.group_name_ko}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCents(source.amount_cents)}
                  </TableCell>
                  <TableCell>{stats.registrationCount}</TableCell>
                  <TableCell className="font-medium">
                    {formatCents(stats.totalAllocated)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={source.is_active ? "default" : "secondary"}>
                      {source.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
                {isExpanded && sourceAllocations.map((alloc) => (
                  <TableRow key={alloc.id} className="bg-muted/30">
                    <TableCell />
                    <TableCell colSpan={2}>
                      <div className="flex items-center gap-2 pl-4">
                        <span className="text-sm font-mono">
                          {alloc.eckcm_registrations.confirmation_code}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          — {alloc.representative_name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {alloc.participant_count} participant{alloc.participant_count !== 1 ? "s" : ""}
                    </TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="font-medium text-sm">
                      {formatCents(alloc.amount_cents)}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {new Date(alloc.created_at).toLocaleDateString()}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
      </>
      )}

      {/* Add Custom Funding Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HandCoins className="size-4" /> Add Custom Funding
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Funding Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Anonymous Donor, Church Scholarship Fund"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Amount ($) *</Label>
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
              <Label>Sponsor</Label>
              <Input
                value={form.sponsor_name}
                onChange={(e) => setForm((f) => ({ ...f, sponsor_name: e.target.value }))}
                placeholder="Optional — who is providing this funding"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Optional note to track this funding..."
                rows={2}
              />
            </div>
            <Button onClick={handleAddFunding} disabled={saving} className="w-full">
              {saving ? "Saving..." : "Add Funding"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => {
          if (deleteTarget) {
            handleDeleteFunding(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        title="Delete Custom Funding"
        description={
          deleteTarget
            ? `Delete the custom funding "${deleteTarget.name}" (${formatCents(deleteTarget.amount_cents)})? This cannot be undone.`
            : ""
        }
      />
    </div>
  );
}
