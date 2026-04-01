"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime, useChangeDetector } from "@/lib/hooks/use-realtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { useTableSort } from "@/lib/hooks/use-table-sort";
import { SortableTableHead } from "@/components/ui/sortable-table-head";

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

export function AuditLogsTable() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AuditLogRow | null>(null);
  const pageSize = 7;

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
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
      `
      )
      .order("created_at", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (data) {
      // Collect registration entity_ids to batch-fetch confirmation codes
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
            regs.map((r: { id: string; confirmation_code: string }) => [r.id, r.confirmation_code])
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
        confirmation_code: log.entity_type === "registration" && log.entity_id
          ? codeMap[log.entity_id] ?? null
          : null,
      }));
      setLogs(rows);
    }
    setLoading(false);
  }, [page]);

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

  const filtered = logs.filter((log) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.entity_type.toLowerCase().includes(q) ||
      (log.actor_email?.toLowerCase().includes(q) ?? false) ||
      (log.actor_name?.toLowerCase().includes(q) ?? false) ||
      (log.entity_id?.toLowerCase().includes(q) ?? false) ||
      (log.confirmation_code?.toLowerCase().includes(q) ?? false)
    );
  });

  const { sortedData: sorted, sortConfig, requestSort } = useTableSort(filtered);

  const actionColor: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    CREATE: "default",
    UPDATE: "secondary",
    DELETE: "destructive",
  };

  function summarizeDetails(log: AuditLogRow): string {
    if (!log.new_data) return "-";
    const data = log.new_data;
    const parts: string[] = [];

    // Show key fields for common actions
    if (data.reason) parts.push(`reason: ${data.reason}`);
    if (data.amount_cents != null) parts.push(`$${(Number(data.amount_cents) / 100).toFixed(2)}`);
    if (data.status) parts.push(`status: ${data.status}`);
    if (data.payment_status) parts.push(`payment: ${data.payment_status}`);
    if (data.action_type) parts.push(`type: ${data.action_type}`);
    if (data.payment_method) parts.push(`method: ${data.payment_method}`);

    if (parts.length > 0) return parts.join(" | ");
    // Fallback: show first few keys
    const keys = Object.keys(data).slice(0, 3);
    return keys.map((k) => `${k}: ${JSON.stringify(data[k])}`).join(", ");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit Logs</h1>

      <Input
        placeholder="Search action, entity, actor, registration code..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        className="max-w-sm"
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {filtered.length} log(s) (page {page + 1})
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
                    <SortableTableHead sortKey="created_at" sortConfig={sortConfig} onSort={requestSort}>Time</SortableTableHead>
                    <SortableTableHead sortKey="action" sortConfig={sortConfig} onSort={requestSort}>Action</SortableTableHead>
                    <SortableTableHead sortKey="entity_type" sortConfig={sortConfig} onSort={requestSort}>Entity</SortableTableHead>
                    <SortableTableHead sortKey="confirmation_code" sortConfig={sortConfig} onSort={requestSort}>Reg Code</SortableTableHead>
                    <SortableTableHead sortKey="actor_name" sortConfig={sortConfig} onSort={requestSort}>Actor</SortableTableHead>
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

              <div className="flex gap-2 justify-center mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logs.length < pageSize}
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
      <Dialog open={!!selectedLog} onOpenChange={(open) => { if (!open) setSelectedLog(null); }}>
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
              {/* Meta info */}
              <div className="grid grid-cols-2 gap-2 text-xs border rounded-md p-3 bg-muted/30">
                <div>
                  <span className="text-muted-foreground">Time: </span>
                  {new Date(selectedLog.created_at).toLocaleString()}
                </div>
                <div>
                  <span className="text-muted-foreground">Actor: </span>
                  {selectedLog.actor_name ?? "—"}
                  {selectedLog.actor_email && (
                    <span className="text-muted-foreground"> ({selectedLog.actor_email})</span>
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

              {/* New Data */}
              {selectedLog.new_data && (
                <div>
                  <h4 className="font-medium mb-1">Details (new_data)</h4>
                  <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(selectedLog.new_data, null, 2)}
                  </pre>
                </div>
              )}

              {/* Old Data */}
              {selectedLog.old_data && (
                <div>
                  <h4 className="font-medium mb-1">Previous (old_data)</h4>
                  <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(selectedLog.old_data, null, 2)}
                  </pre>
                </div>
              )}

              {!selectedLog.new_data && !selectedLog.old_data && (
                <p className="text-muted-foreground">No detail data recorded for this log entry.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
