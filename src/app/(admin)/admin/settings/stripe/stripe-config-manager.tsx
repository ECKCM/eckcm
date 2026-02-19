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
import { Eye, EyeOff, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface KeyStatus {
  is_set: boolean;
  last4: string;
}

interface StripeConfig {
  stripe_test_publishable_key: KeyStatus;
  stripe_test_secret_key: KeyStatus;
  stripe_live_publishable_key: KeyStatus;
  stripe_live_secret_key: KeyStatus;
  stripe_test_webhook_secret: KeyStatus;
  stripe_live_webhook_secret: KeyStatus;
}

export function StripeConfigManager() {
  const [config, setConfig] = useState<StripeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    config?.[`stripe_${mode}_publishable_key` as keyof StripeConfig];
  const secretStatus = config?.[`stripe_${mode}_secret_key` as keyof StripeConfig];
  const webhookStatus = config?.[`stripe_${mode}_webhook_secret` as keyof StripeConfig];

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
