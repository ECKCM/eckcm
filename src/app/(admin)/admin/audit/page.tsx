import { AuditLogsTable } from "./audit-logs-table";

export default function AuditPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Audit Logs</h1>
      </div>
      <div className="p-6">
        <AuditLogsTable />
      </div>
    </div>
  );
}
