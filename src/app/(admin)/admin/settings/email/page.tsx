"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { SearchInput } from "@/components/ui/search-input";
import { Label } from "@/components/ui/label";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { sanitizeEmailInput } from "@/lib/utils/field-helpers";
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
  FileText,
  Receipt,
  ChevronDown,
  Save,
  Trash2,
  RefreshCw,
  Heart,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useTableSort } from "@/lib/hooks/use-table-sort";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { buildAnnouncementHtml } from "@/lib/email/templates/announcement";
import { buildDonationReceiptEmail } from "@/lib/email/templates/donation-receipt";
import {
  DONATION_RECEIPT_ORG_INFO,
  donationReceiptNumber,
} from "@/lib/donation/receipt-info";

// ─── Settings Tab ───────────────────────────────────────────────────────────

function SettingsTab() {
  const [config, setConfig] = useState({
    email_from_name: "",
    email_from_address: "",
    email_reply_to: "",
    resend_api_key: { is_set: false, last4: "" },
    resend_env_configured: false,
    resend_configured: false,
    zelle_email: "",
    zelle_account_holder: "",
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
          zelle_email: config.zelle_email,
          zelle_account_holder: config.zelle_account_holder,
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground active:scale-90 active:opacity-70 transition-all"
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
          <div className="space-y-1 pt-2 border-t">
            <Label>Zelle Email</Label>
            <Input
              value={config.zelle_email}
              onChange={(e) =>
                setConfig({ ...config, zelle_email: sanitizeEmailInput(e.target.value) })
              }
              placeholder="zelle@example.com"
              type="email"
            />
          </div>
          <div className="space-y-1">
            <Label>Zelle Account Holder</Label>
            <Input
              value={config.zelle_account_holder}
              onChange={(e) =>
                setConfig({ ...config, zelle_account_holder: e.target.value })
              }
              placeholder="ORGANIZATION NAME"
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

const TEST_SCENARIOS = [
  {
    id: "connectivity",
    label: "Connectivity Check",
    description: "Simple ping — confirms Resend API key and from-address are working.",
    badge: null,
    pdfCount: 0,
  },
  {
    id: "confirmation_stripe",
    label: "Stripe Confirmation",
    description: "Paid confirmation email with Invoice PDF + Receipt PDF attached and E-Pass links.",
    badge: "2 PDFs",
    pdfCount: 2,
  },
  {
    id: "confirmation_zelle_pending",
    label: "Zelle — Pending",
    description: "Registration submitted, awaiting Zelle payment. Includes payment instructions and Invoice PDF. No E-Pass links.",
    badge: "PDF",
    pdfCount: 1,
  },
  {
    id: "confirmation_zelle_paid",
    label: "Zelle — Confirmed",
    description: "Admin confirmed Zelle payment. Includes Receipt PDF only and E-Pass links.",
    badge: "PDF",
    pdfCount: 1,
  },
  {
    id: "confirmation_check_pending",
    label: "Check — Pending",
    description: "Registration submitted, awaiting check payment. Includes mailing instructions and Invoice PDF. No E-Pass links.",
    badge: "PDF",
    pdfCount: 1,
  },
  {
    id: "confirmation_check_paid",
    label: "Check — Confirmed",
    description: "Admin confirmed check payment. Includes Receipt PDF only and E-Pass links.",
    badge: "PDF",
    pdfCount: 1,
  },
  {
    id: "invoice_pdf",
    label: "Invoice PDF",
    description: "Unpaid invoice with Invoice PDF attachment. Tests PDF generation speed.",
    badge: "PDF",
    pdfCount: 1,
  },
] as const;

type ScenarioId = (typeof TEST_SCENARIOS)[number]["id"];

function TestEmailTab() {
  const [to, setTo] = useState("");
  const [scenario, setScenario] = useState<ScenarioId>("connectivity");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSend() {
    if (!to) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, scenario }),
      });
      const data = await res.json();
      if (res.ok) {
        const count = data.pdfCount ?? 0;
        const pdfNote = count > 1 ? ` (with ${count} PDFs)` : count === 1 ? " (with PDF)" : "";
        setResult({ ok: true, message: `Sent${pdfNote} via ${data.from}` });
      } else {
        setResult({ ok: false, message: data.error || "Failed to send." });
      }
    } catch {
      setResult({ ok: false, message: "Network error." });
    } finally {
      setSending(false);
    }
  }

  const selected = TEST_SCENARIOS.find((s) => s.id === scenario)!;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send Test Email</CardTitle>
        <CardDescription>
          Send a realistic test email for each scenario to verify templates, PDF generation, and delivery.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Recipient */}
        <div className="space-y-1.5">
          <Label>Recipient</Label>
          <Input
            placeholder="recipient@example.com"
            type="email"
            value={to}
            onChange={(e) => setTo(sanitizeEmailInput(e.target.value))}
          />
        </div>

        {/* Scenario picker */}
        <div className="space-y-1.5">
          <Label>Scenario</Label>
          <div className="grid gap-2">
            {TEST_SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setScenario(s.id)}
                className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-all ${
                  scenario === s.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50 active:bg-muted active:scale-[0.98]"
                }`}
              >
                <div
                  className={`mt-0.5 size-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                    scenario === s.id ? "border-primary" : "border-muted-foreground/40"
                  }`}
                >
                  {scenario === s.id && (
                    <div className="size-2 rounded-full bg-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{s.label}</span>
                    {s.badge && (
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        {s.badge}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Send button */}
        <Button onClick={handleSend} disabled={sending || !to} className="w-full">
          {sending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Sending {selected.label}…
            </>
          ) : (
            <>
              <Send className="mr-2 size-4" />
              Send {selected.label}
            </>
          )}
        </Button>

        {/* Result */}
        {result && (
          <div
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
              result.ok
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {result.ok ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <XCircle className="size-4 shrink-0" />
            )}
            {result.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── PDF Settings Tab ────────────────────────────────────────────────────────

function PdfSettingsTab() {
  const [settings, setSettings] = useState({
    orgName: "",
    orgSubtitle: "",
    footerText: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/email/config")
      .then((r) => r.json())
      .then((data) => {
        if (data.pdf_settings) {
          setSettings({
            orgName: data.pdf_settings.orgName ?? "ECKCM",
            orgSubtitle: data.pdf_settings.orgSubtitle ?? "East Coast Korean Camp Meeting",
            footerText: data.pdf_settings.footerText ?? "East Coast Korean Camp Meeting · eckcm.com",
          });
        }
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
        body: JSON.stringify({ pdf_settings: settings }),
      });
      if (res.ok) {
        toast.success("PDF settings saved");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save");
      }
    } catch {
      toast.error("Network error");
    }
    setSaving(false);
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
          <CardTitle>PDF Receipt / Invoice Text</CardTitle>
          <CardDescription>
            Customize the text displayed on generated PDF receipts and invoices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Organization Name</Label>
            <Input
              value={settings.orgName}
              onChange={(e) =>
                setSettings({ ...settings, orgName: e.target.value })
              }
              placeholder="ECKCM"
            />
            <p className="text-xs text-muted-foreground">
              Displayed in the PDF header (large text, top-left).
            </p>
          </div>
          <div className="space-y-1">
            <Label>Organization Subtitle</Label>
            <Input
              value={settings.orgSubtitle}
              onChange={(e) =>
                setSettings({ ...settings, orgSubtitle: e.target.value })
              }
              placeholder="East Coast Korean Camp Meeting"
            />
            <p className="text-xs text-muted-foreground">
              Displayed below the organization name in the header.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Footer Text</Label>
            <Input
              value={settings.footerText}
              onChange={(e) =>
                setSettings({ ...settings, footerText: e.target.value })
              }
              placeholder="East Coast Korean Camp Meeting · eckcm.com"
            />
            <p className="text-xs text-muted-foreground">
              Displayed at the bottom of every PDF.
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save PDF Settings"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PDF Preview</CardTitle>
          <CardDescription>
            Preview Invoice and Receipt PDFs with sample data to verify layout and settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              variant="outline"
              className="h-auto py-4"
              onClick={() => window.open("/api/admin/pdf-preview?type=invoice", "_blank")}
            >
              <div className="flex items-center gap-3">
                <FileText className="size-5 shrink-0 text-muted-foreground" />
                <div className="text-left">
                  <div className="font-medium">Invoice PDF</div>
                  <div className="text-xs text-muted-foreground font-normal">Pending payment template</div>
                </div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4"
              onClick={() => window.open("/api/admin/pdf-preview?type=receipt", "_blank")}
            >
              <div className="flex items-center gap-3">
                <Receipt className="size-5 shrink-0 text-muted-foreground" />
                <div className="text-left">
                  <div className="font-medium">Receipt PDF</div>
                  <div className="text-xs text-muted-foreground font-normal">Paid receipt template</div>
                </div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4"
              onClick={() => window.open("/api/admin/pdf-preview?type=donation-receipt", "_blank")}
            >
              <div className="flex items-center gap-3">
                <Heart className="size-5 shrink-0 text-muted-foreground" />
                <div className="text-left">
                  <div className="font-medium">Donation Receipt PDF</div>
                  <div className="text-xs text-muted-foreground font-normal">501(c)(3) tax receipt (attached to donor email)</div>
                </div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
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
  {
    id: "zelle",
    name: "Zelle Payment Instructions",
    description: "Sent after Zelle registration with payment instructions and pending status.",
  },
  {
    id: "check",
    name: "Check Payment Instructions",
    description: "Sent after Check registration with mailing instructions and pending status.",
  },
  {
    id: "donation_receipt",
    name: "Donation Receipt",
    description: "501(c)(3) tax receipt emailed to donors after a successful donation. The official PDF is attached — preview it under the PDF Settings tab.",
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
    zelle: buildZellePreview(),
    check: buildCheckPreview(),
    donation_receipt: buildDonationReceiptPreview(),
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

function buildDonationReceiptPreview(): string {
  return buildDonationReceiptEmail({
    receiptNumber: donationReceiptNumber("3f2a1b9c-0000-0000-0000-000000000001"),
    receiptDate: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "America/New_York",
    }),
    donorName: "John Doe",
    contributionFormatted: "$103.30",
    baseAmountFormatted: "$100.00",
    coveredFeeFormatted: "$3.30",
    designation: "General Fund",
    paymentReference: "pi_3PExamplePreview001",
    orgLegalName: DONATION_RECEIPT_ORG_INFO.legalName,
    orgEin: DONATION_RECEIPT_ORG_INFO.ein,
    orgAddressLines: DONATION_RECEIPT_ORG_INFO.addressLines,
    orgContactEmail: DONATION_RECEIPT_ORG_INFO.contactEmail,
    taxExemptStatement: DONATION_RECEIPT_ORG_INFO.taxExemptStatement,
  });
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
<table width="100%" style="padding:16px;text-align:center;"><tr><td><p style="font-size:12px;color:#9ca3af;">East Coast Korean Camp Meeting</p></td></tr></table>
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
<table width="100%" style="padding:16px;text-align:center;"><tr><td><p style="font-size:12px;color:#9ca3af;">East Coast Korean Camp Meeting</p></td></tr></table>
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
<table width="100%" style="padding:16px;text-align:center;"><tr><td><p style="font-size:12px;color:#9ca3af;">East Coast Korean Camp Meeting</p></td></tr></table>
</td></tr></table></body></html>`;
}

function buildAnnouncementPreview(): string {
  return buildAnnouncementHtml({
    subject: "Important Update",
    bodyHtml: `<p>Dear Campers,</p>
<p>We are excited to announce that registration for ECKCM Summer Camp 2026 is now open! Please visit our website to complete your registration.</p>
<p>We look forward to seeing you at Camp Berkshire!</p>`,
    eventName: "ECKCM Summer Camp 2026",
    unsubscribeEmail: "contact@eckcm.com",
  });
}

function buildZellePreview(): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:sans-serif;background:#f9fafb;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:20px;">
<tr><td>
<table width="100%" style="background:#0f172a;border-radius:8px 8px 0 0;padding:24px;text-align:center;">
<tr><td><h1 style="color:#fff;margin:0;font-size:24px;">ECKCM</h1><p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">Registration Submitted</p></td></tr>
</table>
<table width="100%" style="background:#fff;padding:32px;border:1px solid #e5e7eb;">
<tr><td>
<p style="font-size:16px;color:#111827;">Your registration has been submitted!</p>
<table width="100%" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
<tr><td><p style="font-size:12px;color:#6b7280;margin:0;">Confirmation Code</p><p style="font-size:32px;font-family:monospace;font-weight:bold;color:#111827;margin:8px 0 0;letter-spacing:4px;">R26KIM0001</p></td></tr>
</table>
<table width="100%" style="margin-bottom:24px;">
<tr><td style="padding:4px 0;color:#6b7280;font-size:14px;">Event</td><td style="padding:4px 0;color:#111827;font-size:14px;text-align:right;">ECKCM Summer Camp 2026</td></tr>
<tr><td style="padding:4px 0;color:#6b7280;font-size:14px;">Location</td><td style="padding:4px 0;color:#111827;font-size:14px;text-align:right;">Camp Berkshire, NY</td></tr>
<tr><td style="padding:4px 0;color:#6b7280;font-size:14px;">Amount Due</td><td style="padding:4px 0;color:#111827;font-size:14px;font-weight:bold;text-align:right;">$450.00</td></tr>
</table>
<h3 style="font-size:14px;color:#6b7280;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">Zelle Payment Instructions</h3>
<table width="100%" style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:20px;margin-bottom:24px;">
<tr><td>
<p style="font-size:14px;color:#6b21a8;margin:0 0 12px;">Please send your Zelle payment using the details below:</p>
<table width="100%">
<tr><td style="padding:4px 0;color:#6b7280;font-size:14px;">1. Send with Zelle to:</td><td style="padding:4px 0;color:#111827;font-size:14px;font-weight:bold;text-align:right;">kimdani1@icloud.com</td></tr>
<tr><td style="padding:4px 0;color:#6b7280;font-size:14px;">2. Account Holder:</td><td style="padding:4px 0;color:#111827;font-size:14px;font-weight:bold;text-align:right;">EMPOWER MINISTRY GROUP, INC</td></tr>
<tr><td style="padding:4px 0;color:#6b7280;font-size:14px;">3. Amount:</td><td style="padding:4px 0;color:#111827;font-size:14px;font-weight:bold;text-align:right;">$450.00</td></tr>
</table>
<p style="font-size:14px;color:#6b7280;margin:12px 0 4px;">4. Memo/Note <span style="color:#dc2626;font-weight:bold;">(Required)</span>:</p>
<p style="font-size:14px;font-family:monospace;background:#ffffff;border:1px solid #e9d5ff;border-radius:4px;padding:8px 12px;color:#111827;margin:0 0 12px;">R26KIM0001 - John Kim - 2125550100 - john@example.com</p>
<p style="font-size:12px;color:#7c3aed;margin:0 0 12px;">Please copy and paste the memo exactly as shown so we can match your payment.</p>
<table width="100%" style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px;">
<tr><td><p style="font-size:13px;font-weight:bold;color:#92400e;margin:0 0 4px;">Important</p>
<p style="font-size:12px;color:#a16207;margin:0;">Your registration will remain in &ldquo;Pending Payment&rdquo; status until your Zelle payment is received and verified. This may take 1-3 business days. Room assignments will not be made until payment is confirmed.</p>
</td></tr></table>
</td></tr></table>
<p style="font-size:13px;color:#6b7280;margin:0;">E-Pass links will be sent in a separate email once your payment is confirmed.</p>
</td></tr></table>
<table width="100%" style="padding:16px;text-align:center;"><tr><td><p style="font-size:12px;color:#9ca3af;">East Coast Korean Camp Meeting</p></td></tr></table>
</td></tr></table></body></html>`;
}

function buildCheckPreview(): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:sans-serif;background:#f9fafb;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:20px;">
<tr><td>
<table width="100%" style="background:#0f172a;border-radius:8px 8px 0 0;padding:24px;text-align:center;">
<tr><td><h1 style="color:#fff;margin:0;font-size:24px;">ECKCM</h1><p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">Registration Submitted</p></td></tr>
</table>
<table width="100%" style="background:#fff;padding:32px;border:1px solid #e5e7eb;">
<tr><td>
<p style="font-size:16px;color:#111827;">Your registration has been submitted!</p>
<table width="100%" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
<tr><td><p style="font-size:12px;color:#6b7280;margin:0;">Confirmation Code</p><p style="font-size:32px;font-family:monospace;font-weight:bold;color:#111827;margin:8px 0 0;letter-spacing:4px;">R26KIM0001</p></td></tr>
</table>
<table width="100%" style="margin-bottom:24px;">
<tr><td style="padding:4px 0;color:#6b7280;font-size:14px;">Event</td><td style="padding:4px 0;color:#111827;font-size:14px;text-align:right;">ECKCM Summer Camp 2026</td></tr>
<tr><td style="padding:4px 0;color:#6b7280;font-size:14px;">Location</td><td style="padding:4px 0;color:#111827;font-size:14px;text-align:right;">Camp Berkshire, NY</td></tr>
<tr><td style="padding:4px 0;color:#6b7280;font-size:14px;">Amount Due</td><td style="padding:4px 0;color:#111827;font-size:14px;font-weight:bold;text-align:right;">$450.00</td></tr>
</table>
<h3 style="font-size:14px;color:#6b7280;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">Check Payment Instructions</h3>
<table width="100%" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin-bottom:24px;">
<tr><td>
<p style="font-size:14px;color:#166534;margin:0 0 12px;">Please mail your check using the details below:</p>
<table width="100%">
<tr><td style="padding:4px 0;color:#6b7280;font-size:14px;">1. Make check payable to:</td><td style="padding:4px 0;color:#111827;font-size:14px;font-weight:bold;text-align:right;">ECKCM</td></tr>
<tr><td style="padding:4px 0;color:#6b7280;font-size:14px;">2. Amount:</td><td style="padding:4px 0;color:#111827;font-size:14px;font-weight:bold;text-align:right;">$450.00</td></tr>
</table>
<p style="font-size:14px;color:#6b7280;margin:12px 0 4px;">3. On the memo line, write <span style="color:#dc2626;font-weight:bold;">(Required)</span>:</p>
<p style="font-size:14px;font-family:monospace;background:#ffffff;border:1px solid #bbf7d0;border-radius:4px;padding:8px 12px;color:#111827;margin:0 0 12px;">R26KIM0001</p>
<p style="font-size:14px;color:#6b7280;margin:12px 0 4px;">4. Mail to:</p>
<div style="font-size:14px;font-weight:600;color:#111827;padding-left:20px;margin:0 0 12px;">
<p style="margin:0;">ECKCM</p>
<p style="margin:0;">574 Mountain Shadow Ln</p>
<p style="margin:0;">Maryville, TN 37803</p>
</div>
<table width="100%" style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px;">
<tr><td><p style="font-size:13px;font-weight:bold;color:#92400e;margin:0 0 4px;">Important</p>
<p style="font-size:12px;color:#a16207;margin:0;">Your registration will remain in &ldquo;Pending Payment&rdquo; status until your check is received and verified. This may take 5&ndash;10 business days. Room assignments will not be made until payment is confirmed.</p>
</td></tr></table>
</td></tr></table>
<p style="font-size:13px;color:#6b7280;margin:0;">E-Pass links will be sent in a separate email once your payment is confirmed.</p>
</td></tr></table>
<table width="100%" style="padding:16px;text-align:center;"><tr><td><p style="font-size:12px;color:#9ca3af;">East Coast Korean Camp Meeting</p></td></tr></table>
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
  const { sortedData: sortedLogs, sortConfig: logSortConfig, requestSort: requestLogSort } = useTableSort(logs);

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
          <SearchInput
            placeholder="Search email or subject..."
            value={search}
            onValueChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            containerClassName="max-w-xs"
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
                  <SortableTableHead sortKey="created_at" sortConfig={logSortConfig} onSort={requestLogSort}>Date</SortableTableHead>
                  <SortableTableHead sortKey="to_email" sortConfig={logSortConfig} onSort={requestLogSort}>To</SortableTableHead>
                  <SortableTableHead sortKey="subject" sortConfig={logSortConfig} onSort={requestLogSort}>Subject</SortableTableHead>
                  <SortableTableHead sortKey="template" sortConfig={logSortConfig} onSort={requestLogSort}>Template</SortableTableHead>
                  <SortableTableHead sortKey="status" sortConfig={logSortConfig} onSort={requestLogSort}>Status</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLogs.map((log) => (
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
                {sortedLogs.length === 0 && (
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

interface DepartmentOption {
  id: string;
  name_en: string;
  name_ko: string | null;
  short_code: string | null;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  department_ids: string[];
  updated_at: string;
}

interface RecipientPreview {
  count: number;
  sample: string[];
}

function AnnouncementTab() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [eventId, setEventId] = useState("");
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [preview, setPreview] = useState<RecipientPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [unsubscribeEmail, setUnsubscribeEmail] = useState("contact@eckcm.com");
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{
    sentCount: number;
    failCount: number;
    total: number;
  } | null>(null);

  // ── Load reference data ────────────────────────────────────────────────
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

    supabase
      .from("eckcm_departments")
      .select("id, name_en, name_ko, short_code")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        if (data) setDepartments(data);
      });

    // Pull the reply-to address so the live preview footer matches what
    // the server will inject when the email is actually sent.
    fetch("/api/admin/email/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.email_reply_to) setUnsubscribeEmail(data.email_reply_to);
      })
      .catch(() => {
        // non-fatal — preview just shows the default
      });
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/email/templates");
      if (!res.ok) return;
      const data = await res.json();
      setTemplates(data.templates ?? []);
    } catch {
      // ignore — templates are non-blocking
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // ── Recipient count preview ────────────────────────────────────────────
  useEffect(() => {
    if (!eventId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    const params = new URLSearchParams({ eventId });
    if (selectedDeptIds.length > 0) {
      params.set("departmentIds", selectedDeptIds.join(","));
    }
    const handle = setTimeout(() => {
      fetch(`/api/admin/email/recipients?${params}`)
        .then((r) => r.json().then((j) => ({ ok: r.ok, json: j })))
        .then(({ ok, json }) => {
          if (cancelled) return;
          if (!ok) {
            setPreviewError(json.error ?? "Failed to load preview");
            setPreview(null);
          } else {
            setPreview({ count: json.count ?? 0, sample: json.sample ?? [] });
          }
        })
        .catch(() => {
          if (!cancelled) setPreviewError("Network error");
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [eventId, selectedDeptIds]);

  // ── Template helpers ───────────────────────────────────────────────────
  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === activeTemplateId) ?? null,
    [templates, activeTemplateId]
  );

  function loadTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setActiveTemplateId(t.id);
    setTemplateName(t.name);
    setSubject(t.subject);
    setBody(t.body_html);
    setSelectedDeptIds(t.department_ids ?? []);
    toast.success(`Loaded template "${t.name}"`);
  }

  function newTemplate() {
    setActiveTemplateId(null);
    setTemplateName("");
    setSubject("");
    setBody("");
    setSelectedDeptIds([]);
    toast.message("Cleared composer");
  }

  async function handleSaveAs() {
    const name = templateName.trim();
    if (!name) {
      toast.error("Template name is required");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and body are required");
      return;
    }
    setSavingTemplate(true);
    try {
      const res = await fetch("/api/admin/email/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          subject,
          body_html: body,
          department_ids: selectedDeptIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save template");
      } else {
        toast.success(`Saved template "${data.template.name}"`);
        await loadTemplates();
        setActiveTemplateId(data.template.id);
        setSaveAsOpen(false);
      }
    } catch {
      toast.error("Network error");
    }
    setSavingTemplate(false);
  }

  async function handleUpdateTemplate() {
    if (!activeTemplate) return;
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and body are required");
      return;
    }
    setSavingTemplate(true);
    try {
      const res = await fetch(
        `/api/admin/email/templates/${activeTemplate.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: templateName.trim() || activeTemplate.name,
            subject,
            body_html: body,
            department_ids: selectedDeptIds,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to update template");
      } else {
        toast.success(`Updated "${data.template.name}"`);
        await loadTemplates();
      }
    } catch {
      toast.error("Network error");
    }
    setSavingTemplate(false);
  }

  async function handleDeleteTemplate() {
    if (!deleteTemplateId) return;
    try {
      const res = await fetch(
        `/api/admin/email/templates/${deleteTemplateId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete");
      } else {
        toast.success("Template deleted");
        if (activeTemplateId === deleteTemplateId) {
          newTemplate();
        }
        await loadTemplates();
      }
    } catch {
      toast.error("Network error");
    }
    setDeleteTemplateId(null);
  }

  // ── Send ───────────────────────────────────────────────────────────────
  async function handleSend(testOnly: boolean) {
    if (!eventId || !subject.trim() || !body.trim()) {
      toast.error("Please fill in event, subject, and body");
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/email/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          subject,
          body,
          departmentIds: selectedDeptIds,
          testOnly,
        }),
      });

      // Try JSON first; fall back to the raw response body so the admin
      // sees what actually went wrong (instead of a generic "Network error").
      const raw = await res.text();
      let data: { error?: string; sentCount?: number; details?: unknown } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        // Non-JSON response (usually a Next.js error HTML page). Surface a
        // short snippet plus the HTTP status so we can diagnose.
        const snippet = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
        toast.error(
          `Server ${res.status} ${res.statusText || ""}: ${snippet || "no response body"}`
        );
        return;
      }

      if (!res.ok) {
        const detail =
          data.details && typeof data.details === "object"
            ? ` — ${JSON.stringify(data.details)}`
            : "";
        toast.error(
          `${data.error || `Send failed (HTTP ${res.status})`}${detail}`
        );
      } else if (testOnly) {
        toast.success("Test email sent to your email");
      } else {
        setResult(data as { sentCount: number; failCount: number; total: number });
        toast.success(`Sent to ${data.sentCount ?? 0} recipient(s)`);
      }
    } catch (err) {
      // True fetch-level failure (server down, CORS, DNS, etc.)
      toast.error(
        `Network error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    setSending(false);
    setConfirmOpen(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────
  const selectedDeptLabel = useMemo(() => {
    if (selectedDeptIds.length === 0) return "All departments";
    if (selectedDeptIds.length === departments.length)
      return `All departments (${departments.length})`;
    if (selectedDeptIds.length <= 2) {
      return departments
        .filter((d) => selectedDeptIds.includes(d.id))
        .map((d) => d.short_code || d.name_en)
        .join(", ");
    }
    return `${selectedDeptIds.length} departments selected`;
  }, [selectedDeptIds, departments]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Send Announcement</CardTitle>
          <CardDescription>
            Bulk email participants of an event. Filter by department, compose
            with a rich editor, save reusable templates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Template picker */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Template</Label>
              {activeTemplate && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  onClick={newTemplate}
                >
                  New / clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Select
                value={activeTemplateId ?? "__none"}
                onValueChange={(v) => {
                  if (v === "__none") {
                    newTemplate();
                  } else {
                    loadTemplate(v);
                  }
                }}
              >
                <SelectTrigger className="flex-1 min-w-[220px]">
                  <SelectValue placeholder="Load a saved template…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— No template —</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                  {templates.length === 0 && (
                    <SelectItem value="__empty" disabled>
                      No saved templates yet
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSaveAsOpen(true)}
                disabled={savingTemplate || !subject || !body}
              >
                <Save className="mr-1 size-3" />
                Save as…
              </Button>
              {activeTemplate && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUpdateTemplate}
                    disabled={savingTemplate}
                  >
                    <RefreshCw className="mr-1 size-3" />
                    Update
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteTemplateId(activeTemplate.id)}
                  >
                    <Trash2 className="mr-1 size-3" />
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Event */}
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

          {/* Department multi-select */}
          <div className="space-y-1">
            <Label>Departments</Label>
            <DepartmentMultiSelect
              departments={departments}
              selected={selectedDeptIds}
              onChange={setSelectedDeptIds}
              triggerLabel={selectedDeptLabel}
            />
            <p className="text-xs text-muted-foreground">
              Empty selection sends to <b>all</b> participants of the event.
              Filtering matches each participant&rsquo;s <i>own</i> department.
            </p>
          </div>

          {/* Recipient preview */}
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            {previewLoading ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Calculating recipients…
              </span>
            ) : previewError ? (
              <span className="text-red-600">{previewError}</span>
            ) : preview ? (
              <div className="space-y-1">
                <p>
                  <b>{preview.count}</b> unique participant email
                  {preview.count === 1 ? "" : "s"} will receive this.
                </p>
                {preview.sample.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Sample: {preview.sample.join(", ")}
                    {preview.count > preview.sample.length && " …"}
                  </p>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">
                Select an event to see recipient count.
              </span>
            )}
          </div>

          {/* Subject */}
          <div className="space-y-1">
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Important update from ECKCM"
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">
              Keep under ~70 characters for best inbox display.{" "}
              <span className={subject.length > 70 ? "text-yellow-600" : ""}>
                {subject.length}/200
              </span>
            </p>
          </div>

          {/* Body */}
          <div className="space-y-1">
            <Label>Body</Label>
            <RichTextEditor
              value={body}
              onChange={setBody}
              placeholder="Dear Campers, …"
              minHeight={260}
            />
            <p className="text-xs text-muted-foreground">
              HTML is sanitized server-side before sending. Links open in a new
              tab; scripts and unsafe attributes are stripped.
            </p>
          </div>

          {/* Live preview */}
          <AnnouncementLivePreview
            subject={subject}
            body={body}
            eventName={
              events.find((e) => e.id === eventId)?.name_en ?? "ECKCM Event"
            }
            unsubscribeEmail={unsubscribeEmail}
          />

          {/* Send buttons */}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              variant="outline"
              onClick={() => handleSend(true)}
              disabled={sending || !subject || !body}
            >
              <Send className="mr-1 size-3" />
              {sending ? "Sending…" : "Send test to me"}
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={
                sending ||
                !subject ||
                !body ||
                !eventId ||
                !preview ||
                preview.count === 0
              }
            >
              <Send className="mr-1 size-3" />
              {preview
                ? `Send to ${preview.count} participant${preview.count === 1 ? "" : "s"}`
                : "Send to all participants"}
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

      {/* Confirm send dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-yellow-500" />
              Confirm bulk send
            </DialogTitle>
            <DialogDescription>
              This will send to {preview?.count ?? "?"} unique participant
              email{preview?.count === 1 ? "" : "s"}. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border p-3 text-sm space-y-1">
            <p>
              <b>Event:</b>{" "}
              {events.find((e) => e.id === eventId)?.name_en ?? ""}
            </p>
            <p>
              <b>Departments:</b>{" "}
              {selectedDeptIds.length === 0
                ? "All"
                : departments
                    .filter((d) => selectedDeptIds.includes(d.id))
                    .map((d) => d.name_en)
                    .join(", ")}
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
              {sending ? "Sending…" : "Confirm send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save-as dialog */}
      <Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              Templates are shared across admins and store the subject, body,
              and department filter.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Template name</Label>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Hansamo welcome 2026"
              maxLength={120}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveAsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveAs}
              disabled={savingTemplate || !templateName.trim()}
            >
              {savingTemplate ? "Saving…" : "Save template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={!!deleteTemplateId}
        onOpenChange={(open) => !open && setDeleteTemplateId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete template?</DialogTitle>
            <DialogDescription>
              This permanently removes the template for everyone. The
              composer&rsquo;s current contents are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTemplateId(null)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteTemplate}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Announcement live preview ──────────────────────────────────────────────

interface AnnouncementLivePreviewProps {
  subject: string;
  body: string;
  eventName: string;
  unsubscribeEmail: string;
}

/**
 * Mirrors the wrapper that the server applies in
 * /api/admin/email/announcement before handing the payload to Resend.
 * Renders inside an iframe so the email's own styles never leak into
 * the admin UI (and vice versa).
 *
 * The body is run through DOMPurify client-side too — purely for the
 * preview. The server re-sanitizes before sending, so this is just to
 * keep the iframe honest while the admin is composing.
 */
function AnnouncementLivePreview({
  subject,
  body,
  eventName,
  unsubscribeEmail,
}: AnnouncementLivePreviewProps) {
  const [collapsed, setCollapsed] = useState(false);

  const srcDoc = useMemo(() => {
    // Empty-state preview so the admin can still see the chrome.
    const subjectForRender = subject.trim() || "(your subject here)";
    const bodyForRender =
      body.trim() ||
      '<p style="color:#9ca3af;font-style:italic;">Start typing in the editor above — your message will appear here exactly as recipients will see it.</p>';

    return buildAnnouncementHtml({
      subject: subjectForRender,
      bodyHtml: bodyForRender,
      eventName,
      unsubscribeEmail,
    });
  }, [subject, body, eventName, unsubscribeEmail]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label>Preview</Label>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          {collapsed ? "Show preview" : "Hide preview"}
        </button>
      </div>
      {!collapsed && (
        <div className="rounded-md border bg-muted/30 p-3">
          <iframe
            srcDoc={srcDoc}
            title="Announcement preview"
            sandbox=""
            className="w-full h-[480px] rounded border bg-white"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            This is exactly how the email will render. The header, footer, and
            unsubscribe line are added automatically — only the body you typed
            above is editable.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Department multi-select ────────────────────────────────────────────────

interface DepartmentMultiSelectProps {
  departments: DepartmentOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  triggerLabel: string;
}

function DepartmentMultiSelect({
  departments,
  selected,
  onChange,
  triggerLabel,
}: DepartmentMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const allSelected =
    departments.length > 0 && selected.length === departments.length;
  const noneSelected = selected.length === 0;

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  function selectAll() {
    onChange(departments.map((d) => d.id));
  }
  function clearAll() {
    onChange([]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate text-left">{triggerLabel}</span>
          <ChevronDown className="ml-2 size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] min-w-[280px] p-0"
      >
        <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            {selected.length} of {departments.length} selected
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-foreground hover:underline underline-offset-2 disabled:opacity-40"
              onClick={selectAll}
              disabled={allSelected}
            >
              Select all
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              className="text-foreground hover:underline underline-offset-2 disabled:opacity-40"
              onClick={clearAll}
              disabled={noneSelected}
            >
              Clear
            </button>
          </div>
        </div>
        <div className="max-h-[280px] overflow-y-auto py-1">
          {departments.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              No departments
            </div>
          ) : (
            departments.map((d) => {
              const checked = selected.includes(d.id);
              return (
                <label
                  key={d.id}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(d.id)}
                  />
                  <span className="flex-1 truncate">
                    {d.short_code ? (
                      <span className="text-muted-foreground">
                        {d.short_code}:{" "}
                      </span>
                    ) : null}
                    {d.name_en}
                    {d.name_ko ? (
                      <span className="text-muted-foreground">
                        {" "}
                        ({d.name_ko})
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function EmailSettingsPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Email Settings</h1>
      </div>
      <div className="mx-auto w-full max-w-3xl p-6">
        <Tabs defaultValue="settings">
          <TabsList className="mb-6">
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="pdf">PDF</TabsTrigger>
            <TabsTrigger value="test">Test Email</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="logs">Email Log</TabsTrigger>
            <TabsTrigger value="announcement">Announcement</TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
            <SettingsTab />
          </TabsContent>

          <TabsContent value="pdf">
            <PdfSettingsTab />
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
