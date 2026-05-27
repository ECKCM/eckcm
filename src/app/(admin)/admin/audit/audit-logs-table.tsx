"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime, useChangeDetector } from "@/lib/hooks/use-realtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTableSort } from "@/lib/hooks/use-table-sort";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { formatCurrency } from "@/lib/utils/formatters";

interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  created_at: string;
  new_data: Record<string, unknown> | null;
  old_data: Record<string, unknown> | null;
  confirmation_code: string | null;
}

const PAGE_SIZE = 25;
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Strip characters that break PostgREST .or() / ilike syntax. Keeps letters,
// digits, and a small set of common punctuation found in emails/codes/names.
function sanitizeForOr(s: string): string {
  return s.replace(/[,()*\\%]/g, "").trim();
}

export function AuditLogsTable() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState(""); // debounced
  const [actionFilter, setActionFilter] = useState<string>("ALL");
  const [entityFilter, setEntityFilter] = useState<string>("ALL");
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AuditLogRow | null>(null);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [actionTypes, setActionTypes] = useState<string[]>([]);

  // Debounce search input → search (300ms)
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Seed filter dropdowns from a recent sample of audit rows (no filters applied)
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("eckcm_audit_logs")
        .select("entity_type, action")
        .order("created_at", { ascending: false })
        .limit(500);
      if (data) {
        const ets = new Set<string>();
        const acs = new Set<string>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.forEach((d: any) => {
          if (d.entity_type) ets.add(d.entity_type);
          if (d.action) acs.add(d.action);
        });
        setEntityTypes(Array.from(ets).sort());
        setActionTypes(Array.from(acs).sort());
      }
    })();
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const q = sanitizeForOr(search);

    // Prefetch matching user_ids (by email) and registration ids (by confirmation_code)
    // so the search box also catches those joined fields.
    let userIdMatches: string[] = [];
    let regIdMatches: string[] = [];
    if (q) {
      const [usersRes, regsRes] = await Promise.all([
        supabase.from("eckcm_users").select("id").ilike("email", `%${q}%`).limit(50),
        supabase
          .from("eckcm_registrations")
          .select("id")
          .ilike("confirmation_code", `%${q}%`)
          .limit(200),
      ]);
      userIdMatches = usersRes.data?.map((u: { id: string }) => u.id) ?? [];
      regIdMatches = regsRes.data?.map((r: { id: string }) => r.id) ?? [];
    }

    let query = supabase
      .from("eckcm_audit_logs")
      .select(
        `
        id,
        action,
        entity_type,
        entity_id,
        created_at,
        new_data,
        old_data,
        actor_name,
        eckcm_users:user_id(email)
      `,
        { count: "exact" }
      );

    if (actionFilter !== "ALL") query = query.eq("action", actionFilter);
    if (entityFilter !== "ALL") query = query.eq("entity_type", entityFilter);

    if (q) {
      const parts: string[] = [
        `action.ilike.%${q}%`,
        `entity_type.ilike.%${q}%`,
        `actor_name.ilike.%${q}%`,
      ];
      if (userIdMatches.length > 0) {
        parts.push(`user_id.in.(${userIdMatches.join(",")})`);
      }
      if (regIdMatches.length > 0) {
        parts.push(`entity_id.in.(${regIdMatches.join(",")})`);
      }
      if (UUID_RX.test(q)) parts.push(`entity_id.eq.${q}`);
      query = query.or(parts.join(","));
    }

    const { data, count } = await query
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (data) {
      // Batch-fetch confirmation_codes for registration entities
      const regEntityIds = data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((log: any) => log.entity_type === "registration" && log.entity_id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((log: any) => log.entity_id as string);

      let codeMap: Record<string, string> = {};
      if (regEntityIds.length > 0) {
        const { data: regs } = await supabase
          .from("eckcm_registrations")
          .select("id, confirmation_code")
          .in("id", regEntityIds);
        if (regs) {
          codeMap = Object.fromEntries(
            regs.map((r: { id: string; confirmation_code: string }) => [
              r.id,
              r.confirmation_code,
            ])
          );
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: AuditLogRow[] = data.map((log: any) => ({
        id: log.id,
        action: log.action,
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        actor_email: log.eckcm_users?.email ?? null,
        actor_name: log.actor_name ?? null,
        created_at: log.created_at,
        new_data: log.new_data,
        old_data: log.old_data,
        confirmation_code:
          log.entity_type === "registration" && log.entity_id
            ? codeMap[log.entity_id] ?? null
            : null,
      }));
      setLogs(rows);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [page, search, actionFilter, entityFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Live updates
  const _reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime({ table: "eckcm_audit_logs", event: "*" }, () => {
    if (_reloadTimer.current) clearTimeout(_reloadTimer.current);
    _reloadTimer.current = setTimeout(loadLogs, 500);
  });
  useChangeDetector("eckcm_audit_logs", loadLogs, 5000);

  // Server already filtered — sort client-side within the visible page only.
  const { sortedData: sorted, sortConfig, requestSort } = useTableSort(logs);

  const actionColor: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    CREATE: "default",
    UPDATE: "secondary",
    DELETE: "destructive",
  };

  function summarizeDetails(log: AuditLogRow): string {
    if (!log.new_data) return "-";
    const data = log.new_data;
    const parts: string[] = [];

    if (data.reason) parts.push(`reason: ${data.reason}`);
    if (data.amount_cents != null) parts.push(formatCurrency(Number(data.amount_cents)));
    if (data.status) parts.push(`status: ${data.status}`);
    if (data.payment_status) parts.push(`payment: ${data.payment_status}`);
    if (data.action_type) parts.push(`type: ${data.action_type}`);
    if (data.payment_method) parts.push(`method: ${data.payment_method}`);

    if (parts.length > 0) return parts.join(" | ");
    const keys = Object.keys(data).slice(0, 3);
    return keys.map((k) => `${k}: ${JSON.stringify(data[k])}`).join(", ");
  }

  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, total);
  const hasNext = (page + 1) * PAGE_SIZE < total;
  const hasActiveFilter =
    search !== "" || actionFilter !== "ALL" || entityFilter !== "ALL";

  function clearAllFilters() {
    setSearchInput("");
    setSearch("");
    setActionFilter("ALL");
    setEntityFilter("ALL");
    setPage(0);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <SearchInput
          placeholder="Search action, entity, actor, email, reg code..."
          value={searchInput}
          onValueChange={setSearchInput}
          containerClassName="w-[320px]"
        />

        <Select
          value={entityFilter}
          onValueChange={(v) => {
            setEntityFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Entity type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All entities</SelectItem>
            {entityTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={actionFilter}
          onValueChange={(v) => {
            setActionFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            {actionTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilter && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters}>
            Clear filters
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {loading
              ? "Loading..."
              : total === 0
              ? "No logs match the current filters"
              : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      sortKey="created_at"
                      sortConfig={sortConfig}
                      onSort={requestSort}
                    >
                      Time
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="action"
                      sortConfig={sortConfig}
                      onSort={requestSort}
                    >
                      Action
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="entity_type"
                      sortConfig={sortConfig}
                      onSort={requestSort}
                    >
                      Entity
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="confirmation_code"
                      sortConfig={sortConfig}
                      onSort={requestSort}
                    >
                      Reg Code
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="actor_name"
                      sortConfig={sortConfig}
                      onSort={requestSort}
                    >
                      Actor
                    </SortableTableHead>
                    <TableHead>Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((log) => (
                    <TableRow
                      key={log.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedLog(log)}
                    >
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionColor[log.action] ?? "outline"}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{log.entity_type}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.confirmation_code ?? "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.actor_name ?? log.actor_email ?? "system"}
                      </TableCell>
                      <TableCell className="text-xs max-w-[300px] truncate">
                        {summarizeDetails(log)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {sorted.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground py-8"
                      >
                        No audit logs found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <div className="flex gap-2 justify-center items-center mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground px-2">
                  Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasNext}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog
        open={!!selectedLog}
        onOpenChange={(open) => {
          if (!open) setSelectedLog(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant={actionColor[selectedLog?.action ?? ""] ?? "outline"}>
                {selectedLog?.action}
              </Badge>
              <span className="text-sm font-normal text-muted-foreground">
                {selectedLog?.entity_type}
              </span>
              {selectedLog?.confirmation_code && (
                <Badge variant="outline" className="font-mono">
                  {selectedLog.confirmation_code}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs border rounded-md p-3 bg-muted/30">
                <div>
                  <span className="text-muted-foreground">Time: </span>
                  {new Date(selectedLog.created_at).toLocaleString()}
                </div>
                <div>
                  <span className="text-muted-foreground">Actor: </span>
                  {selectedLog.actor_name ?? "—"}
                  {selectedLog.actor_email && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({selectedLog.actor_email})
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Entity ID: </span>
                  <span className="font-mono">{selectedLog.entity_id ?? "—"}</span>
                </div>
                {selectedLog.confirmation_code && (
                  <div>
                    <span className="text-muted-foreground">Registration: </span>
                    <span className="font-mono">{selectedLog.confirmation_code}</span>
                  </div>
                )}
              </div>

              {selectedLog.new_data && (
                <div>
                  <h4 className="font-medium mb-1">Details (new_data)</h4>
                  <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(selectedLog.new_data, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.old_data && (
                <div>
                  <h4 className="font-medium mb-1">Previous (old_data)</h4>
                  <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(selectedLog.old_data, null, 2)}
                  </pre>
                </div>
              )}

              {!selectedLog.new_data && !selectedLog.old_data && (
                <p className="text-muted-foreground">
                  No detail data recorded for this log entry.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
