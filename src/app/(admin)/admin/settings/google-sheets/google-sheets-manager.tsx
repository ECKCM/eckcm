"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sheet,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

interface SheetStatus {
  configured: boolean;
  sheetId: string | null;
  sheetNames: Record<string, string> | null;
  sheets: Record<string, number> | null;
}

interface EventOption {
  id: string;
  name_en: string;
  year: number;
}

const APPS_SCRIPT_CODE = `/**
 * ECKCM Google Sheets Integration - Apps Script
 * Paste this into Extensions > Apps Script in your Google Sheet.
 * Deploy as Web App: Execute as Me, Access: Anyone
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var result;
    switch (action) {
      case "ensureSheets": result = handleEnsureSheets(body); break;
      case "sync": result = handleSync(body); break;
      case "incrementalSync": result = handleIncrementalSync(body); break;
      case "clear": result = handleClear(body); break;
      case "status": result = handleStatus(body); break;
      default: result = { error: "Unknown action: " + action };
    }
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function handleEnsureSheets(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = {};
  ss.getSheets().forEach(function (s) { existing[s.getName()] = true; });
  var sheetNames = body.sheetNames || [];
  var headers = body.headers || {};
  for (var i = 0; i < sheetNames.length; i++) {
    var name = sheetNames[i];
    var sheet = existing[name] ? ss.getSheetByName(name) : ss.insertSheet(name);
    var headerRow = headers[name];
    if (headerRow && headerRow.length > 0) {
      sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
      sheet.getRange(1, 1, 1, headerRow.length).setFontWeight("bold");
    }
  }
  return { success: true };
}

function handleSync(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = body.sheets || {};
  var counts = {};
  for (var name in sheets) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) continue;
    var rows = sheets[name];
    counts[name] = rows.length;
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, sheet.getMaxColumns()).clearContent();
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  return { success: true, counts: counts };
}

function handleIncrementalSync(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (body.appendRow && body.appendSheets) {
    for (var i = 0; i < body.appendSheets.length; i++) {
      var sheet = ss.getSheetByName(body.appendSheets[i]);
      if (!sheet) continue;
      var nextRow = sheet.getLastRow() + 1;
      sheet.getRange(nextRow, 1, 1, body.appendRow.length).setValues([body.appendRow]);
    }
  }
  var syncSheets = body.syncSheets || {};
  for (var name in syncSheets) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) continue;
    var rows = syncSheets[name];
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, sheet.getMaxColumns()).clearContent();
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  return { success: true };
}

function handleClear(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetNames = body.sheetNames || [];
  for (var i = 0; i < sheetNames.length; i++) {
    var sheet = ss.getSheetByName(sheetNames[i]);
    if (!sheet) continue;
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, sheet.getMaxColumns()).clearContent();
  }
  return { success: true };
}

function handleStatus(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetNames = body.sheetNames || [];
  var result = {};
  for (var i = 0; i < sheetNames.length; i++) {
    var sheet = ss.getSheetByName(sheetNames[i]);
    result[sheetNames[i]] = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
  }
  return { success: true, sheets: result };
}`;

export function GoogleSheetsManager() {
  const [status, setStatus] = useState<SheetStatus | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showScript, setShowScript] = useState(false);

  useEffect(() => {
    Promise.all([fetchStatus(), fetchEvents()]).finally(() =>
      setLoading(false)
    );
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/admin/google-sheets/status");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus(null);
    }
  }

  async function fetchEvents() {
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_events")
      .select("id, name_en, year")
      .order("is_default", { ascending: false })
      .order("year", { ascending: false });
    setEvents(data ?? []);
    if (data?.[0]) {
      setSelectedEventId(data[0].id);
    }
  }

  async function handleSync() {
    if (!selectedEventId) {
      toast.error("Please select an event");
      return;
    }

    setSyncing(true);
    try {
      const res = await fetch("/api/admin/google-sheets/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: selectedEventId }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Sync failed");
        return;
      }

      toast.success(
        `Synced ${data.registrations} registrations, ${data.participants} participants, ${data.mealRows} meal entries`
      );
      await fetchStatus();
    } catch (err) {
      toast.error("Sync failed: " + String(err));
    } finally {
      setSyncing(false);
    }
  }

  function handleCopyScript() {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    toast.success("Apps Script code copied to clipboard");
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!status?.configured) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sheet className="h-5 w-5" />
              Google Sheets Sync
              <Badge variant="destructive">Not Configured</Badge>
            </CardTitle>
            <CardDescription>
              Set up Google Apps Script to enable automatic registration sync.
              No Google Cloud account needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Setup steps:</p>
              <ol className="list-inside list-decimal space-y-1.5">
                <li>
                  Open your Google Sheet and go to{" "}
                  <strong>Extensions &rarr; Apps Script</strong>
                </li>
                <li>Delete the default code and paste the script below</li>
                <li>
                  Click <strong>Deploy &rarr; New Deployment &rarr; Web App</strong>
                </li>
                <li>
                  Set <strong>&quot;Execute as: Me&quot;</strong> and{" "}
                  <strong>&quot;Who has access: Anyone&quot;</strong>
                </li>
                <li>Copy the Web App URL</li>
                <li>
                  Add to <code>.env.local</code> (or Vercel env):
                </li>
              </ol>
            </div>

            <div className="rounded-lg border bg-muted/50 p-4 font-mono text-sm">
              <p>GOOGLE_APPS_SCRIPT_URL=&quot;https://script.google.com/macros/s/.../exec&quot;</p>
              <p className="text-muted-foreground">
                # Optional: for admin link to the spreadsheet
              </p>
              <p>GOOGLE_SHEET_ID=&quot;your-spreadsheet-id&quot;</p>
            </div>
          </CardContent>
        </Card>

        {/* Apps Script Code */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Apps Script Code</CardTitle>
            <CardDescription>
              Copy and paste this into your Google Sheet&apos;s Apps Script editor.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button onClick={handleCopyScript} size="sm">
                <Copy className="mr-2 h-4 w-4" />
                Copy Code
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowScript(!showScript)}
              >
                {showScript ? (
                  <ChevronUp className="mr-2 h-4 w-4" />
                ) : (
                  <ChevronDown className="mr-2 h-4 w-4" />
                )}
                {showScript ? "Hide" : "Show"} Code
              </Button>
            </div>
            {showScript && (
              <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>{APPS_SCRIPT_CODE}</code>
              </pre>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const sheetUrl = status.sheetId
    ? `https://docs.google.com/spreadsheets/d/${status.sheetId}`
    : null;

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sheet className="h-5 w-5" />
            Google Sheets Sync
            <Badge variant="default" className="bg-green-600">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Connected
            </Badge>
          </CardTitle>
          <CardDescription>
            Registration data is automatically synced to Google Sheets on
            every registration submit and status change.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sheetUrl && (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              Open Google Spreadsheet
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </CardContent>
      </Card>

      {/* Sheet Row Counts */}
      {status.sheets && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sheet Status</CardTitle>
            <CardDescription>
              Row counts for each sheet tab (excluding header)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(status.sheets).map(([name, count]) => (
                <div
                  key={name}
                  className="flex items-center justify-between rounded-lg border px-4 py-2"
                >
                  <span className="text-sm font-medium">{name}</span>
                  <span className="text-sm text-muted-foreground">
                    {count === 0 ? (
                      <span className="flex items-center gap-1 text-amber-600">
                        <XCircle className="h-3.5 w-3.5" />
                        Empty
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {count} rows
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manual Sync</CardTitle>
          <CardDescription>
            Force a full sync of all registration data to Google Sheets.
            This will overwrite all sheets with the latest data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Select
              value={selectedEventId}
              onValueChange={setSelectedEventId}
            >
              <SelectTrigger className="w-[280px]">
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

            <Button
              onClick={handleSync}
              disabled={syncing || !selectedEventId}
            >
              {syncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {syncing ? "Syncing..." : "Sync Now"}
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={fetchStatus}
            className="text-muted-foreground"
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Refresh Status
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
