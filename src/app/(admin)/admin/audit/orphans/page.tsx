"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Orphan {
  piId: string;
  status: string;
  amount: number;
  created: string;
  receiptEmail: string | null;
  metadata: Record<string, string>;
  latestCharge: string | null;
}

interface AuditResult {
  mode: string;
  daysBack: number;
  scanned: number;
  orphanCount: number;
  totalOrphanAmountCents: number;
  orphans: Orphan[];
}

export default function OrphansPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [mode, setMode] = useState<"live" | "test">("live");
  const [daysBack, setDaysBack] = useState(180);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/audit/orphan-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, daysBack }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const copyJson = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Orphan Payments Audit</h1>
      </div>
      <div className="p-6 space-y-4 max-w-4xl">
        <div className="rounded border p-4 space-y-3 bg-muted/30">
          <p className="text-sm text-muted-foreground">
            Scans Stripe for <code>succeeded</code> PaymentIntents whose{" "}
            <code>metadata.registrationId</code> no longer exists in the DB
            (orphaned by the now-fixed cron deletion bug). Read-only.
            SUPER_ADMIN only. May take 30s–2min depending on volume.
          </p>

          <div className="flex items-center gap-3">
            <label className="text-sm">
              Mode:{" "}
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as "live" | "test")}
                className="border rounded px-2 py-1"
                disabled={loading}
              >
                <option value="live">live</option>
                <option value="test">test</option>
              </select>
            </label>
            <label className="text-sm">
              Days back:{" "}
              <input
                type="number"
                value={daysBack}
                onChange={(e) => setDaysBack(Number(e.target.value) || 180)}
                className="border rounded px-2 py-1 w-20"
                disabled={loading}
              />
            </label>
            <Button onClick={run} disabled={loading}>
              {loading ? "Scanning Stripe…" : "Run Audit"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
            <strong>Error:</strong> {error}
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="rounded border p-4 grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Scanned</div>
                <div className="text-2xl font-semibold">{result.scanned}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Orphans</div>
                <div
                  className={`text-2xl font-semibold ${
                    result.orphanCount > 0 ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {result.orphanCount}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Total Orphan $
                </div>
                <div className="text-2xl font-semibold">
                  ${(result.totalOrphanAmountCents / 100).toFixed(2)}
                </div>
              </div>
            </div>

            {result.orphans.length > 0 && (
              <div className="rounded border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2">PI ID</th>
                      <th className="text-left p-2">Amount</th>
                      <th className="text-left p-2">Created</th>
                      <th className="text-left p-2">Email</th>
                      <th className="text-left p-2">Confirmation</th>
                      <th className="text-left p-2">Registration ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.orphans.map((o) => (
                      <tr key={o.piId} className="border-t align-top">
                        <td className="p-2 font-mono text-xs">
                          <a
                            href={`https://dashboard.stripe.com/payments/${o.piId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {o.piId}
                          </a>
                        </td>
                        <td className="p-2">${(o.amount / 100).toFixed(2)}</td>
                        <td className="p-2 text-xs">
                          {new Date(o.created).toLocaleString()}
                        </td>
                        <td className="p-2 text-xs">{o.receiptEmail ?? "—"}</td>
                        <td className="p-2 font-mono text-xs">
                          {o.metadata.confirmationCode ?? "—"}
                        </td>
                        <td className="p-2 font-mono text-xs">
                          {o.metadata.registrationId ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Button variant="outline" onClick={copyJson}>
              Copy full JSON to clipboard
            </Button>

            <details className="rounded border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Raw JSON
              </summary>
              <pre className="mt-2 text-xs overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
