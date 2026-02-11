"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
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

interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_email: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export function AuditLogsTable() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("ECKCM_audit_logs")
      .select(
        `
        id,
        action,
        entity_type,
        entity_id,
        created_at,
        metadata,
        ECKCM_users:actor_id(email)
      `
      )
      .order("created_at", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: AuditLogRow[] = data.map((log: any) => ({
        id: log.id,
        action: log.action,
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        actor_email: log.ECKCM_users?.email ?? null,
        created_at: log.created_at,
        metadata: log.metadata,
      }));
      setLogs(rows);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filtered = logs.filter((log) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.entity_type.toLowerCase().includes(q) ||
      (log.actor_email?.toLowerCase().includes(q) ?? false) ||
      (log.entity_id?.toLowerCase().includes(q) ?? false)
    );
  });

  const actionColor: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    CREATE: "default",
    UPDATE: "secondary",
    DELETE: "destructive",
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit Logs</h1>

      <Input
        placeholder="Search action, entity, actor..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
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
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log) => (
                    <TableRow key={log.id}>
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
                        {log.entity_id?.slice(0, 8) ?? "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.actor_email ?? "system"}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">
                        {log.metadata ? JSON.stringify(log.metadata) : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
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
    </div>
  );
}
