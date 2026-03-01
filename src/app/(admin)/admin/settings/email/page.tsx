"use client";

import { useState, useEffect, useCallback } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Send,
  AlertTriangle,
  KeyRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ─── Settings Tab ───────────────────────────────────────────────────────────

function SettingsTab() {
  const [config, setConfig] = useState({
    email_from_name: "",
    email_from_address: "",
    email_reply_to: "",
    resend_api_key: { is_set: false, last4: "" },
    resend_env_configured: false,
    resend_configured: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [editingKey, setEditingKey] = useState(false);

  useEffect(() => {
    fetch("/api/admin/email/config")
      .then((r) => r.json())
      .then((data) => {
        setConfig(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/email/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_from_name: config.email_from_name,
          email_from_address: config.email_from_address,
          email_reply_to: config.email_reply_to,
        }),
      });
      if (res.ok) {
        toast.success("Email settings saved");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save");
      }
    } catch {
      toast.error("Network error");
    }
    setSaving(false);
  }

  async function handleSaveApiKey() {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    try {
      const res = await fetch("/api/admin/email/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resend_api_key: apiKeyInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Resend API key saved");
        setConfig((prev) => ({
          ...prev,
          resend_api_key: data.resend_api_key,
          resend_configured: true,
        }));
        setApiKeyInput("");
        setEditingKey(false);
      } else {
        toast.error(data.error || "Failed to save API key");
      }
    } catch {
      toast.error("Network error");
    }
    setSavingKey(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-5" />
            Resend API Key
          </CardTitle>
          <CardDescription>
            Configure the Resend API key for email delivery. The key is stored encrypted in the database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Label className="w-32">Provider</Label>
            <span className="text-sm">Resend</span>
          </div>

          {/* DB Key Status */}
          <div className="flex items-center gap-2">
            <Label className="w-32">DB Key</Label>
            {config.resend_api_key.is_set ? (
              <div className="flex items-center gap-2">
                <Badge variant="default">Set</Badge>
                <span className="text-xs text-muted-foreground font-mono">
                  ****{config.resend_api_key.last4}
                </span>
              </div>
            ) : (
              <Badge variant="destructive">Not Set</Badge>
            )}
          </div>

          {/* Env Key Status */}
          <div className="flex items-center gap-2">
            <Label className="w-32">Env Fallback</Label>
            {config.resend_env_configured ? (
              <Badge variant="secondary">Available</Badge>
            ) : (
              <Badge variant="outline">Not Set</Badge>
            )}
          </div>

          {/* Edit / Set API Key */}
          {editingKey ? (
            <div className="space-y-2 border rounded-md p-3">
              <Label>Resend API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Must start with <code>re_</code>. Get your key from{" "}
                <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">
                  resend.com/api-keys
                </a>
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveApiKey}
                  disabled={savingKey || !apiKeyInput.trim()}
                >
                  {savingKey ? "Saving..." : "Save Key"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingKey(false);
                    setApiKeyInput("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingKey(true)}
            >
              {config.resend_api_key.is_set ? "Change API Key" : "Set API Key"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sender Settings</CardTitle>
          <CardDescription>Configure the from address for all outgoing emails.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>From Name</Label>
            <Input
              value={config.email_from_name}
              onChange={(e) =>
                setConfig({ ...config, email_from_name: e.target.value })
              }
              placeholder="ECKCM"
            />
          </div>
          <div className="space-y-1">
            <Label>From Address</Label>
            <Input
              value={config.email_from_address}
              onChange={(e) =>
                setConfig({ ...config, email_from_address: e.target.value })
              }
              placeholder="noreply@eckcm.com"
            />
          </div>
          <div className="space-y-1">
            <Label>Reply-To Address (optional)</Label>
            <Input
              value={config.email_reply_to}
              onChange={(e) =>
                setConfig({ ...config, email_reply_to: e.target.value })
              }
              placeholder="contact@eckcm.com"
            />
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Test Email Tab ─────────────────────────────────────────────────────────

function TestEmailTab() {
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSendTest() {
    if (!testEmail) return;
    setSending(true);
    setStatus(null);
    try {
      const res = await fetch("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail }),
      });
      if (res.ok) {
        setStatus("Test email sent successfully!");
      } else {
        setStatus("Failed to send test email. Check server logs.");
      }
    } catch {
      setStatus("Error sending test email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send Test Email</CardTitle>
        <CardDescription>
          Verify your email configuration by sending a test email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="recipient@example.com"
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />
          <Button onClick={handleSendTest} disabled={sending || !testEmail}>
            {sending ? "Sending..." : "Send Test"}
          </Button>
        </div>
        {status && (
          <p className="text-sm text-muted-foreground">{status}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Templates Tab ──────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: "confirmation",
    name: "Registration Confirmation",
    description: "Sent after successful payment with confirmation code and E-Pass links.",
  },
  {
    id: "invoice",
    name: "Invoice / Receipt",
    description: "Invoice (unpaid) or Receipt (paid) with line items and payment details.",
  },
  {
    id: "epass",
    name: "E-Pass",
    description: "Individual E-Pass link sent to a participant.",
  },
  {
    id: "announcement",
    name: "Announcement",
    description: "Bulk announcement email with custom subject and body.",
  },
];

function TemplatesTab() {
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Email Templates</CardTitle>
          <CardDescription>
            All templates are code-based and styled with inline CSS for email client compatibility.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {TEMPLATES.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewTemplate(t.id)}
                >
                  <Eye className="mr-1 size-3" />
                  Preview
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!previewTemplate}
        onOpenChange={(open) => !open && setPreviewTemplate(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Template Preview: {TEMPLATES.find((t) => t.id === previewTemplate)?.name}
            </DialogTitle>
          </DialogHeader>
          <TemplatePreview templateId={previewTemplate} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplatePreview({ templateId }: { templateId: string | null }) {
  if (!templateId) return null;

  const previewData: Record<string, string> = {
    confirmation: buildConfirmationPreview(),
    invoice: buildInvoicePreview(),
    epass: buildEpassPreview(),
    announcement: buildAnnouncementPreview(),
  };

  const html = previewData[templateId] || "<p>No preview available</p>";

  return (
    <iframe
      srcDoc={html}
      className="w-full h-[500px] border rounded"
      title="Email Preview"
      sandbox="allow-same-origin"
    />
  );
}

function buildConfirmationPreview(): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:sans-serif;background:#f9fafb;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:20px;">
<tr><td>
<table width="100%" style="background:#0f172a;border-radius:8px 8px 0 0;padding:24px;text-align:center;">
<tr><td><h1 style="color:#fff;margin:0;font-size:24px;">ECKCM</h1><p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">Registration Confirmation</p></td></tr>
</table>
<table width="100%" style="background:#fff;padding:32px;border:1px solid #e5e7eb;">
<tr><td>
<p style="font-size:16px;color:#111827;">Your registration has been confirmed!</p>
<table width="100%" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
<tr><td><p style="font-size:12px;color:#6b7280;margin:0;">Confirmation Code</p><p style="font-size:32px;font-family:monospace;font-weight:bold;color:#111827;margin:8px 0 0;letter-spacing:4px;">R26KIM0001</p></td></tr>
</table>
<p style="font-size:14px;color:#6b7280;">Event: ECKCM Summer Camp 2026</p>
<p style="font-size:14px;color:#6b7280;">Location: Camp Berkshire, NY</p>
<p style="font-size:14px;color:#6b7280;">Amount Paid: <b>$450.00</b></p>
</td></tr></table>
<table width="100%" style="padding:16px;text-align:center;"><tr><td><p style="font-size:12px;color:#9ca3af;">Eastern Korean Churches Camp Meeting</p></td></tr></table>
</td></tr></table></body></html>`;
}

function buildInvoicePreview(): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:sans-serif;background:#f9fafb;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:20px;">
<tr><td>
<table width="100%" style="background:#0f172a;border-radius:8px 8px 0 0;padding:24px;">
<tr><td><h1 style="color:#fff;margin:0;font-size:24px;">ECKCM</h1><p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">Invoice</p></td>
<td style="text-align:right;vertical-align:top;"><p style="color:#94a3b8;margin:0;font-size:12px;">Invoice #</p><p style="color:#fff;margin:4px 0 0;font-size:16px;font-family:monospace;">INV-2026-0001</p></td></tr>
</table>
<table width="100%" style="background:#fff;padding:32px;border:1px solid #e5e7eb;">
<tr><td>
<table width="100%" style="margin-bottom:24px;">
<tr><td style="color:#6b7280;font-size:14px;">Event</td><td style="text-align:right;color:#111827;font-size:14px;">ECKCM Summer Camp 2026</td></tr>
<tr><td style="color:#6b7280;font-size:14px;">Confirmation</td><td style="text-align:right;font-family:monospace;">R26KIM0001</td></tr>
<tr><td style="color:#6b7280;font-size:14px;">Payment Method</td><td style="text-align:right;">CARD</td></tr>
<tr><td style="color:#6b7280;font-size:14px;">Payment Date</td><td style="text-align:right;">2/15/2026</td></tr>
</table>
<table width="100%" style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
<tr style="background:#f9fafb;"><th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">Description</th><th style="text-align:center;font-size:12px;color:#6b7280;">Qty</th><th style="text-align:right;font-size:12px;color:#6b7280;">Unit Price</th><th style="text-align:right;font-size:12px;color:#6b7280;">Amount</th></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">Registration Fee</td><td style="text-align:center;border-bottom:1px solid #e5e7eb;">2</td><td style="text-align:right;border-bottom:1px solid #e5e7eb;">$150.00</td><td style="text-align:right;border-bottom:1px solid #e5e7eb;">$300.00</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">Lodging</td><td style="text-align:center;border-bottom:1px solid #e5e7eb;">7</td><td style="text-align:right;border-bottom:1px solid #e5e7eb;">$20.00</td><td style="text-align:right;border-bottom:1px solid #e5e7eb;">$140.00</td></tr>
</table>
<table width="100%"><tr><td style="color:#6b7280;font-size:14px;">Subtotal</td><td style="text-align:right;">$440.00</td></tr>
<tr style="border-top:2px solid #111827;"><td style="padding:8px 0 0;font-size:16px;font-weight:bold;">Total</td><td style="padding:8px 0 0;text-align:right;font-size:16px;font-weight:bold;">$440.00</td></tr></table>
</td></tr></table>
<table width="100%" style="padding:16px;text-align:center;"><tr><td><p style="font-size:12px;color:#9ca3af;">Eastern Korean Churches Camp Meeting</p></td></tr></table>
</td></tr></table></body></html>`;
}

function buildEpassPreview(): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:sans-serif;background:#f9fafb;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:20px;">
<tr><td>
<table width="100%" style="background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:8px 8px 0 0;padding:24px;text-align:center;">
<tr><td><h1 style="color:#fff;margin:0;font-size:24px;">ECKCM E-Pass</h1></td></tr>
</table>
<table width="100%" style="background:#fff;padding:32px;border:1px solid #e5e7eb;">
<tr><td>
<p style="font-size:16px;color:#111827;">Hello, <b>John Kim</b>!</p>
<p style="font-size:14px;color:#6b7280;">Your E-Pass for ECKCM Summer Camp 2026 is ready.</p>
<table width="100%" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:20px;text-align:center;margin:24px 0;">
<tr><td><p style="font-size:12px;color:#6b7280;margin:0;">Confirmation Code</p><p style="font-size:24px;font-family:monospace;font-weight:bold;margin:8px 0 0;">R26KIM0001</p></td></tr>
</table>
<div style="text-align:center;"><a href="#" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold;">View E-Pass</a></div>
</td></tr></table>
<table width="100%" style="padding:16px;text-align:center;"><tr><td><p style="font-size:12px;color:#9ca3af;">Eastern Korean Churches Camp Meeting</p></td></tr></table>
</td></tr></table></body></html>`;
}

function buildAnnouncementPreview(): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:sans-serif;background:#f9fafb;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:20px;">
<tr><td>
<table width="100%" style="background:#0f172a;border-radius:8px 8px 0 0;padding:24px;text-align:center;">
<tr><td><h1 style="color:#fff;margin:0;font-size:24px;">ECKCM</h1><p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">ECKCM Summer Camp 2026</p></td></tr>
</table>
<table width="100%" style="background:#fff;padding:32px;border:1px solid #e5e7eb;">
<tr><td>
<h2 style="font-size:20px;color:#111827;margin:0 0 16px;">Important Update</h2>
<div style="font-size:15px;color:#374151;line-height:1.6;">
<p>Dear Campers,</p>
<p>We are excited to announce that registration for ECKCM Summer Camp 2026 is now open! Please visit our website to complete your registration.</p>
<p>We look forward to seeing you at Camp Berkshire!</p>
</div>
</td></tr></table>
<table width="100%" style="padding:16px;text-align:center;"><tr><td><p style="font-size:12px;color:#9ca3af;">Eastern Korean Churches Camp Meeting</p></td></tr></table>
</td></tr></table></body></html>`;
}

// ─── Email Log Tab ──────────────────────────────────────────────────────────

interface EmailLog {
  id: string;
  to_email: string;
  subject: string;
  template: string;
  status: string;
  error_message: string | null;
  created_at: string;
  sent_by: string | null;
}

function EmailLogTab() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/email/logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotalPages(data.totalPages);
        setTotal(data.total);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const templateLabel: Record<string, string> = {
    confirmation: "Confirmation",
    invoice: "Invoice",
    receipt: "Receipt",
    announcement: "Announcement",
    test: "Test",
    epass: "E-Pass",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Email Log</CardTitle>
            <CardDescription>{total} email(s) sent</CardDescription>
          </div>
          <Input
            placeholder="Search email or subject..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="max-w-xs"
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {log.to_email}
                    </TableCell>
                    <TableCell className="text-sm max-w-[250px] truncate">
                      {log.subject}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {templateLabel[log.template] || log.template}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {log.status === "sent" ? (
                        <CheckCircle2 className="size-4 text-green-600" />
                      ) : (
                        <XCircle className="size-4 text-red-500" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground py-8"
                    >
                      No email logs found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Announcement Tab ───────────────────────────────────────────────────────

interface EventOption {
  id: string;
  name_en: string;
  year: number;
}

function AnnouncementTab() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventId, setEventId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{
    sentCount: number;
    failCount: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("eckcm_events")
      .select("id, name_en, year")
      .eq("is_active", true)
      .order("year", { ascending: false })
      .then(({ data }) => {
        if (data) {
          setEvents(data);
          if (data.length > 0) setEventId(data[0].id);
        }
      });
  }, []);

  async function handleSend(testOnly: boolean) {
    if (!eventId || !subject || !body) {
      toast.error("Please fill in all fields");
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/email/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, subject, body, testOnly }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to send");
      } else if (testOnly) {
        toast.success("Test email sent to your email");
      } else {
        setResult(data);
        toast.success(`Sent to ${data.sentCount} recipient(s)`);
      }
    } catch {
      toast.error("Network error");
    }
    setSending(false);
    setConfirmOpen(false);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Send Announcement</CardTitle>
          <CardDescription>
            Send a bulk email to all registrants of a selected event.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Event</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger>
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
          </div>

          <div className="space-y-1">
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Important Update from ECKCM"
            />
          </div>

          <div className="space-y-1">
            <Label>Body (HTML supported)</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="<p>Dear Campers,</p><p>We are excited to announce...</p>"
              rows={8}
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleSend(true)}
              disabled={sending || !subject || !body}
            >
              <Send className="mr-1 size-3" />
              {sending ? "Sending..." : "Send Test to Me"}
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={sending || !subject || !body || !eventId}
            >
              <Send className="mr-1 size-3" />
              Send to All Registrants
            </Button>
          </div>

          {result && (
            <div className="rounded-md border p-3 text-sm">
              <p>
                Sent: <b>{result.sentCount}</b> / {result.total}
                {result.failCount > 0 && (
                  <span className="text-red-500 ml-2">
                    Failed: {result.failCount}
                  </span>
                )}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-yellow-500" />
              Confirm Bulk Send
            </DialogTitle>
            <DialogDescription>
              This will send an email to <b>all registrants</b> of the selected
              event. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border p-3 text-sm space-y-1">
            <p>
              <b>Event:</b>{" "}
              {events.find((e) => e.id === eventId)?.name_en ?? ""}
            </p>
            <p>
              <b>Subject:</b> {subject}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => handleSend(false)} disabled={sending}>
              {sending ? "Sending..." : "Confirm Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function EmailSettingsPage() {
  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Email Settings</h1>
      </header>
      <div className="mx-auto w-full max-w-3xl p-6">
        <Tabs defaultValue="settings">
          <TabsList className="mb-6">
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="test">Test Email</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="logs">Email Log</TabsTrigger>
            <TabsTrigger value="announcement">Announcement</TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
            <SettingsTab />
          </TabsContent>

          <TabsContent value="test">
            <TestEmailTab />
          </TabsContent>

          <TabsContent value="templates">
            <TemplatesTab />
          </TabsContent>

          <TabsContent value="logs">
            <EmailLogTab />
          </TabsContent>

          <TabsContent value="announcement">
            <AnnouncementTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
