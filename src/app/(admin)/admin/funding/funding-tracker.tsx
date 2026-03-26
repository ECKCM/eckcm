"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, DollarSign, Users, FileText } from "lucide-react";

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

function formatCents(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function FundingTracker() {
  const [sources, setSources] = useState<FundingSource[]>([]);
  const [allocations, setAllocations] = useState<FundingAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);

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
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  if (loading) {
    return <p className="text-center text-muted-foreground py-8">Loading...</p>;
  }

  if (sources.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <p>No funding sources configured yet.</p>
        <p className="text-sm mt-1">
          Create a fee category with category &quot;FUNDING&quot; in Settings &rarr; Fee Categories.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
    </div>
  );
}
