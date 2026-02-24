"use client";

import { useState, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Eye,
  EyeOff,
  Loader2,
  Save,
  CreditCard,
  Landmark,
  Building2,
  Banknote,
  Smartphone,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";

interface KeyStatus {
  is_set: boolean;
  last4: string;
}

type PaymentMethodId = "card" | "ach" | "zelle" | "check" | "wallet" | "more";

const PAYMENT_METHOD_OPTIONS: {
  id: PaymentMethodId;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "card",
    label: "Credit / Debit Card",
    description: "Visa, Mastercard, Amex",
    icon: <CreditCard className="h-4 w-4" />,
  },
  {
    id: "ach",
    label: "ACH Transfer",
    description: "Bank account routing/account number",
    icon: <Building2 className="h-4 w-4" />,
  },
  {
    id: "zelle",
    label: "Zelle",
    description: "Instructions-based, pay later via Zelle",
    icon: <Landmark className="h-4 w-4" />,
  },
  {
    id: "check",
    label: "Bank Check",
    description: "ACH Direct Debit via routing/account number",
    icon: <Banknote className="h-4 w-4" />,
  },
  {
    id: "wallet",
    label: "Apple Pay / Google Pay",
    description: "Mobile wallet payments",
    icon: <Smartphone className="h-4 w-4" />,
  },
  {
    id: "more",
    label: "More Payment Options",
    description: "Amazon Pay, Klarna, etc. via Stripe",
    icon: <MoreHorizontal className="h-4 w-4" />,
  },
];

interface StripeConfig {
  stripe_test_publishable_key: KeyStatus;
  stripe_test_secret_key: KeyStatus;
  stripe_live_publishable_key: KeyStatus;
  stripe_live_secret_key: KeyStatus;
  stripe_test_webhook_secret: KeyStatus;
  stripe_live_webhook_secret: KeyStatus;
  enabled_payment_methods: PaymentMethodId[];
  deduct_stripe_fees_on_refund: boolean;
  donor_covers_fees_registration: boolean;
  donor_covers_fees_donation: boolean;
}

export function StripeConfigManager() {
  const [config, setConfig] = useState<StripeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingMethods, setSavingMethods] = useState(false);
  const [enabledMethods, setEnabledMethods] = useState<PaymentMethodId[]>([
    "card", "ach", "zelle", "check", "wallet", "more",
  ]);
  const [deductFees, setDeductFees] = useState(false);
  const [donorCoversRegistration, setDonorCoversRegistration] = useState(false);
  const [donorCoversDonation, setDonorCoversDonation] = useState(false);
  const [testKeys, setTestKeys] = useState({ publishable: "", secret: "", webhook: "" });
  const [liveKeys, setLiveKeys] = useState({ publishable: "", secret: "", webhook: "" });
  const [showSecret, setShowSecret] = useState({
    test: false,
    live: false,
    testWebhook: false,
    liveWebhook: false,
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    try {
      const res = await fetch("/api/admin/stripe-config");
      if (!res.ok) {
        toast.error("Failed to load Stripe configuration");
        return;
      }
      const data: StripeConfig = await res.json();
      setConfig(data);
      if (data.enabled_payment_methods) {
        setEnabledMethods(data.enabled_payment_methods);
      }
      setDeductFees(data.deduct_stripe_fees_on_refund ?? false);
      setDonorCoversRegistration(data.donor_covers_fees_registration ?? false);
      setDonorCoversDonation(data.donor_covers_fees_donation ?? false);
    } catch {
      toast.error("Network error loading Stripe config");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(mode: "test" | "live") {
    const keys = mode === "test" ? testKeys : liveKeys;
    const updates: Record<string, string> = {};

    if (keys.publishable.trim()) {
      updates[`stripe_${mode}_publishable_key`] = keys.publishable.trim();
    }
    if (keys.secret.trim()) {
      updates[`stripe_${mode}_secret_key`] = keys.secret.trim();
    }
    if (keys.webhook.trim()) {
      updates[`stripe_${mode}_webhook_secret`] = keys.webhook.trim();
    }

    if (Object.keys(updates).length === 0) {
      toast.error("Enter at least one key to save");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/stripe-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Failed to save (${res.status})`);
        return;
      }

      toast.success(
        `${mode === "test" ? "Test" : "Live"} mode keys saved successfully`
      );

      // Clear inputs and refresh
      if (mode === "test") setTestKeys({ publishable: "", secret: "", webhook: "" });
      else setLiveKeys({ publishable: "", secret: "", webhook: "" });

      await fetchConfig();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleMethod(methodId: PaymentMethodId, enabled: boolean) {
    const updated = enabled
      ? [...enabledMethods, methodId]
      : enabledMethods.filter((m) => m !== methodId);

    if (updated.length === 0) {
      toast.error("At least one payment method must be enabled");
      return;
    }

    setEnabledMethods(updated);
    setSavingMethods(true);

    try {
      const res = await fetch("/api/admin/stripe-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled_payment_methods: updated }),
      });

      if (!res.ok) {
        // Revert on error
        setEnabledMethods(enabledMethods);
        toast.error("Failed to update payment methods");
        return;
      }

      toast.success(`${enabled ? "Enabled" : "Disabled"} ${PAYMENT_METHOD_OPTIONS.find((m) => m.id === methodId)?.label}`);
    } catch {
      setEnabledMethods(enabledMethods);
      toast.error("Network error. Please try again.");
    } finally {
      setSavingMethods(false);
    }
  }

  async function handleToggleDeductFees(checked: boolean) {
    setDeductFees(checked);
    try {
      const res = await fetch("/api/admin/stripe-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deduct_stripe_fees_on_refund: checked }),
      });
      if (!res.ok) {
        setDeductFees(!checked);
        toast.error("Failed to update setting");
        return;
      }
      toast.success(checked ? "Stripe fees will be deducted from refunds" : "Full refund amount will be issued");
    } catch {
      setDeductFees(!checked);
      toast.error("Network error");
    }
  }

  async function handleToggleDonorCoversFees(field: "donor_covers_fees_registration" | "donor_covers_fees_donation", checked: boolean) {
    const setter = field === "donor_covers_fees_registration" ? setDonorCoversRegistration : setDonorCoversDonation;
    setter(checked);
    try {
      const res = await fetch("/api/admin/stripe-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: checked }),
      });
      if (!res.ok) {
        setter(!checked);
        toast.error("Failed to update setting");
        return;
      }
      const label = field === "donor_covers_fees_registration" ? "Registration" : "Donation";
      toast.success(checked ? `Donor fee coverage enabled for ${label}` : `Donor fee coverage disabled for ${label}`);
    } catch {
      setter(!checked);
      toast.error("Network error");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Configure your Stripe API keys for processing payments. Each event can
        be set to use either Test or Live mode keys.
      </p>

      {/* Payment Methods */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Methods</CardTitle>
          <CardDescription>
            Choose which payment methods are available to registrants.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {PAYMENT_METHOD_OPTIONS.map((method) => (
            <div
              key={method.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <div className="text-muted-foreground">{method.icon}</div>
                <div>
                  <p className="text-sm font-medium">{method.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {method.description}
                  </p>
                </div>
              </div>
              <Switch
                checked={enabledMethods.includes(method.id)}
                onCheckedChange={(checked) =>
                  handleToggleMethod(method.id, checked)
                }
                disabled={savingMethods}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Refund Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Refund Settings</CardTitle>
          <CardDescription>
            Control how refund amounts are calculated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Deduct Stripe Processing Fees</p>
              <p className="text-xs text-muted-foreground">
                When enabled, refunds will exclude Stripe processing fees (2.9% + $0.30 for cards, 0.8% capped at $5 for ACH).
                Stripe does not refund their processing fees.
              </p>
            </div>
            <Switch
              checked={deductFees}
              onCheckedChange={handleToggleDeductFees}
            />
          </div>
        </CardContent>
      </Card>

      {/* Donor Covers Fees */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Donor Covers Fees</CardTitle>
          <CardDescription>
            Allow payers to optionally cover Stripe processing fees (2.9% + $0.30).
            When enabled, a checkbox will appear at checkout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Registration Payment</p>
              <p className="text-xs text-muted-foreground">
                Show &ldquo;I&rsquo;d like to cover the payment processing fee&rdquo; checkbox on the registration checkout page.
              </p>
            </div>
            <Switch
              checked={donorCoversRegistration}
              onCheckedChange={(checked) => handleToggleDonorCoversFees("donor_covers_fees_registration", checked)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Donation Payment Portal</p>
              <p className="text-xs text-muted-foreground">
                Show &ldquo;I&rsquo;d like to cover the payment processing fee&rdquo; checkbox on the donation payment page.
              </p>
            </div>
            <Switch
              checked={donorCoversDonation}
              onCheckedChange={(checked) => handleToggleDonorCoversFees("donor_covers_fees_donation", checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Test Mode Keys */}
      <KeyCard
        mode="test"
        config={config}
        keys={testKeys}
        onKeysChange={setTestKeys}
        showSecret={showSecret.test}
        onToggleSecret={() =>
          setShowSecret((s) => ({ ...s, test: !s.test }))
        }
        showWebhook={showSecret.testWebhook}
        onToggleWebhook={() =>
          setShowSecret((s) => ({ ...s, testWebhook: !s.testWebhook }))
        }
        onSave={() => handleSave("test")}
        saving={saving}
      />

      {/* Live Mode Keys */}
      <KeyCard
        mode="live"
        config={config}
        keys={liveKeys}
        onKeysChange={setLiveKeys}
        showSecret={showSecret.live}
        onToggleSecret={() =>
          setShowSecret((s) => ({ ...s, live: !s.live }))
        }
        showWebhook={showSecret.liveWebhook}
        onToggleWebhook={() =>
          setShowSecret((s) => ({ ...s, liveWebhook: !s.liveWebhook }))
        }
        onSave={() => handleSave("live")}
        saving={saving}
      />
    </div>
  );
}

/** Anti-autofill props for text inputs */
const noAutoFillText = {
  autoComplete: "one-time-code",
  "data-1p-ignore": true,
  "data-lpignore": "true",
} as const;

/** Anti-autofill props for password inputs */
const noAutoFillPassword = {
  autoComplete: "new-password",
  "data-1p-ignore": true,
  "data-lpignore": "true",
} as const;

function KeyCard({
  mode,
  config,
  keys,
  onKeysChange,
  showSecret,
  onToggleSecret,
  showWebhook,
  onToggleWebhook,
  onSave,
  saving,
}: {
  mode: "test" | "live";
  config: StripeConfig | null;
  keys: { publishable: string; secret: string; webhook: string };
  onKeysChange: (keys: { publishable: string; secret: string; webhook: string }) => void;
  showSecret: boolean;
  onToggleSecret: () => void;
  showWebhook: boolean;
  onToggleWebhook: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const isLive = mode === "live";
  const publishableStatus =
    config?.[`stripe_${mode}_publishable_key` as keyof StripeConfig] as KeyStatus | undefined;
  const secretStatus =
    config?.[`stripe_${mode}_secret_key` as keyof StripeConfig] as KeyStatus | undefined;
  const webhookStatus =
    config?.[`stripe_${mode}_webhook_secret` as keyof StripeConfig] as KeyStatus | undefined;

  const hasChanges = keys.publishable.trim() || keys.secret.trim() || keys.webhook.trim();

  return (
    <Card className={isLive ? "border-orange-500/30" : ""}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <CardTitle className="text-base">
            {isLive ? "Live Mode" : "Test Mode"}
          </CardTitle>
          <Badge variant={isLive ? "destructive" : "secondary"}>
            {isLive ? "LIVE" : "TEST"}
          </Badge>
        </div>
        <CardDescription>
          {isLive
            ? "Real payments will be processed with these keys."
            : "Use these keys for testing. No real charges will be made."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Publishable Key */}
        <div className="space-y-1.5">
          <Label>Publishable Key</Label>
          {publishableStatus?.is_set && !keys.publishable && (
            <p className="text-xs text-muted-foreground">
              Current: pk_{mode}_****{publishableStatus.last4}
            </p>
          )}
          <Input
            placeholder={`pk_${mode}_...`}
            value={keys.publishable}
            onChange={(e) =>
              onKeysChange({ ...keys, publishable: e.target.value })
            }
            {...noAutoFillText}
          />
        </div>

        {/* Secret Key */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Secret Key</Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onToggleSecret}
            >
              {showSecret ? (
                <EyeOff className="h-3 w-3 mr-1" />
              ) : (
                <Eye className="h-3 w-3 mr-1" />
              )}
              {showSecret ? "Hide" : "Show"}
            </Button>
          </div>
          {secretStatus?.is_set && !keys.secret && (
            <p className="text-xs text-muted-foreground">
              Current: sk_{mode}_****{secretStatus.last4}
            </p>
          )}
          <Input
            type={showSecret ? "text" : "password"}
            placeholder={`sk_${mode}_...`}
            value={keys.secret}
            onChange={(e) =>
              onKeysChange({ ...keys, secret: e.target.value })
            }
            {...noAutoFillPassword}
          />
        </div>

        <Separator />

        {/* Webhook Secret */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Webhook Secret</Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onToggleWebhook}
            >
              {showWebhook ? (
                <EyeOff className="h-3 w-3 mr-1" />
              ) : (
                <Eye className="h-3 w-3 mr-1" />
              )}
              {showWebhook ? "Hide" : "Show"}
            </Button>
          </div>
          {webhookStatus?.is_set && !keys.webhook && (
            <p className="text-xs text-muted-foreground">
              Current: whsec_****{webhookStatus.last4}
            </p>
          )}
          <Input
            type={showWebhook ? "text" : "password"}
            placeholder="whsec_..."
            value={keys.webhook}
            onChange={(e) =>
              onKeysChange({ ...keys, webhook: e.target.value })
            }
            {...noAutoFillPassword}
          />
          <p className="text-xs text-muted-foreground">
            Found in Stripe Dashboard &rarr; Developers &rarr; Webhooks &rarr; Signing secret
          </p>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={onSave}
            disabled={saving || !hasChanges}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save {isLive ? "Live" : "Test"} Keys
          </Button>
          {hasChanges && (
            <Button
              variant="ghost"
              onClick={() => onKeysChange({ publishable: "", secret: "", webhook: "" })}
              disabled={saving}
            >
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
