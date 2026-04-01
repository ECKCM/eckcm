"use client";

import { useState, useRef, useEffect } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { StripePaymentElementChangeEvent } from "@stripe/stripe-js";
import { getStripe } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import Link from "next/link";
import {
  Heart,
  Loader2,
  Lock,
  ShieldCheck,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { sanitizeEmailInput } from "@/lib/utils/field-helpers";

const STRIPE_APPEARANCE = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#0f172a",
    colorBackground: "#ffffff",
    colorText: "#0f172a",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    borderRadius: "8px",
  },
};

const PRESET_AMOUNTS = [2000, 5000, 10000, 30000]; // $20, $50, $100, $300

export default function DonationPage() {
  const { t, locale } = useI18n();

  /* ---- departments ---- */
  const [departments, setDepartments] = useState<{ id: string; name_en: string; name_ko: string }[]>([]);
  const [departmentId, setDepartmentId] = useState<string>("");

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("eckcm_departments")
      .select("id, name_en, name_ko")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        if (data) setDepartments(data);
      });
  }, []);

  /* ---- amount input ---- */
  const [amountInput, setAmountInput] = useState("");
  const [amountCents, setAmountCents] = useState<number | null>(null);

  /* ---- donor info (optional) ---- */
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");

  /* ---- fees ---- */
  const [coversFees, setCoversFees] = useState(true);
  const [feeCents, setFeeCents] = useState(0);
  const [chargeAmount, setChargeAmount] = useState(0);

  /* ---- Stripe state ---- */
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [donationId, setDonationId] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ---- success state ---- */
  const [success, setSuccess] = useState(false);

  const handleAmountSelect = (cents: number) => {
    setAmountCents(cents);
    setAmountInput((cents / 100).toFixed(2));
    // Reset Stripe state if amount changes after intent created
    if (clientSecret) {
      setClientSecret(null);
      setDonationId(null);
    }
  };

  const handleAmountInputChange = (val: string) => {
    // Allow only numbers and one decimal point
    const cleaned = val.replace(/[^0-9.]/g, "");
    setAmountInput(cleaned);
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num >= 1 && num <= 10000) {
      setAmountCents(Math.round(num * 100));
    } else {
      setAmountCents(null);
    }
    // Reset Stripe state if amount changes
    if (clientSecret) {
      setClientSecret(null);
      setDonationId(null);
    }
  };

  const handleProceedToPayment = async () => {
    if (!amountCents || amountCents < 100) {
      toast.error(t("donation.minAmountError"));
      return;
    }

    setLoadingIntent(true);
    setError(null);

    try {
      const res = await fetch("/api/donation/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents,
          donorName: donorName || undefined,
          donorEmail: donorEmail || undefined,
          coversFees,
          departmentId: departmentId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("donation.failedInit"));
        return;
      }

      setClientSecret(data.clientSecret);
      setDonationId(data.donationId);
      setChargeAmount(data.chargeAmount);
      setFeeCents(data.feeCents);
    } catch {
      setError(t("donation.networkError"));
    } finally {
      setLoadingIntent(false);
    }
  };

  if (success) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-bold">{t("donation.thankYou")}</h2>
            <p className="text-muted-foreground">
              {t("donation.donationReceivedAmount", { amount: `$${((amountCents ?? 0) / 100).toFixed(2)}` })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("donation.receiptSent")}
            </p>
            <div className="pt-4 flex flex-col gap-2">
              <Button
                onClick={() => {
                  setSuccess(false);
                  setAmountInput("");
                  setAmountCents(null);
                  setClientSecret(null);
                  setDonationId(null);
                  setDonorName("");
                  setDonorEmail("");
                  setDepartmentId("");
                  setCoversFees(false);
                }}
                variant="outline"
              >
                {t("donation.makeAnother")}
              </Button>
              <Button asChild variant="ghost">
                <Link href="/">{t("donation.backToHome")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("donation.backToHome")}
      </Link>

      <div className="text-center mb-8">
        <Heart className="h-10 w-10 text-primary mx-auto mb-3" />
        <h1 className="text-3xl font-bold">{t("donation.makeDonation")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t("donation.supportDesc")}
        </p>
      </div>

      {!clientSecret ? (
        /* ---- Step 1: Amount & Info ---- */
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("donation.donationAmount")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Preset amounts */}
              <div className="grid grid-cols-4 gap-2">
                {PRESET_AMOUNTS.map((cents) => (
                  <Button
                    key={cents}
                    variant={amountCents === cents ? "default" : "outline"}
                    onClick={() => handleAmountSelect(cents)}
                    className="text-sm"
                  >
                    ${(cents / 100).toFixed(0)}
                  </Button>
                ))}
              </div>

              {/* Custom amount */}
              <div>
                <Label htmlFor="amount">{t("donation.customAmount")}</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amountInput}
                    onChange={(e) => handleAmountInputChange(e.target.value)}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("donation.minMax")}
                </p>
              </div>

              {/* Cover fees */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={coversFees}
                  onChange={(e) => setCoversFees(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                />
                <div>
                  <p className="text-sm font-medium">
                    {t("donation.coverFees")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("donation.coverFeesDesc")}
                  </p>
                </div>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {t("donation.yourInfo")}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({t("profile.optional")})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {departments.length > 0 && (
                <div>
                  <Label>{t("donation.department")}</Label>
                  <Select value={departmentId} onValueChange={setDepartmentId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={t("donation.selectDepartment")} />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {locale === "ko" ? d.name_ko : d.name_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label htmlFor="donorName">{t("donation.donorName")}</Label>
                <Input
                  id="donorName"
                  value={donorName}
                  onChange={(e) => setDonorName(e.target.value)}
                  placeholder="Your name"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="donorEmail">{t("donation.donorEmail")}</Label>
                <Input
                  id="donorEmail"
                  type="email"
                  value={donorEmail}
                  onChange={(e) => setDonorEmail(sanitizeEmailInput(e.target.value))}
                  placeholder="you@example.com"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t("donation.forReceiptOnly")}
                </p>
              </div>
            </CardContent>
          </Card>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <Button
            onClick={handleProceedToPayment}
            disabled={!amountCents || amountCents < 100 || loadingIntent}
            size="lg"
            className="w-full"
          >
            {loadingIntent ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("donation.preparing")}
              </>
            ) : (
              <>
                {t("donation.continueToPayment")}
                {amountCents && amountCents >= 100 && (
                  <span className="ml-2">
                    — ${(amountCents / 100).toFixed(2)}
                  </span>
                )}
              </>
            )}
          </Button>
        </div>
      ) : (
        /* ---- Step 2: Stripe Payment ---- */
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  {t("donation.securePayment")}
                </span>
                <span className="text-2xl font-bold">
                  ${(chargeAmount / 100).toFixed(2)}
                </span>
              </CardTitle>
              {feeCents > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("donation.includesFee", { amount: (feeCents / 100).toFixed(2) })}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <Elements
                stripe={getStripe()}
                options={{
                  clientSecret,
                  appearance: STRIPE_APPEARANCE,
                }}
              >
                <DonationCheckoutForm
                  donationId={donationId!}
                  onSuccess={() => setSuccess(true)}
                />
              </Elements>
            </CardContent>
          </Card>

          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setClientSecret(null);
              setDonationId(null);
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("donation.changeAmount")}
          </Button>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{t("donation.securedByStripe")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stripe checkout form (inside Elements provider)                    */
/* ------------------------------------------------------------------ */

function DonationCheckoutForm({
  donationId,
  onSuccess,
}: {
  donationId: string;
  onSuccess: () => void;
}) {
  const { t } = useI18n();
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [ready, setReady] = useState(false);
  const processingRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || processingRef.current) return;

    processingRef.current = true;
    setProcessing(true);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/donation`,
      },
      redirect: "if_required",
    });

    if (error) {
      toast.error(error.message || t("payment.paymentFailed"));
      setProcessing(false);
      processingRef.current = false;
      return;
    }

    // Confirm on our backend
    if (paymentIntent) {
      try {
        await fetch("/api/donation/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            donationId,
            paymentIntentId: paymentIntent.id,
          }),
        });
      } catch (err) {
        console.error("[donation] confirm error:", err);
      }
    }

    toast.success(t("donation.donationSuccess"));
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement
        onChange={(e: StripePaymentElementChangeEvent) => {
          if (e.complete) setReady(true);
          else setReady(false);
        }}
      />
      <Button
        type="submit"
        disabled={!stripe || !ready || processing}
        className="w-full"
        size="lg"
      >
        {processing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("common.processing")}
          </>
        ) : (
          t("donation.donateNow")
        )}
      </Button>
    </form>
  );
}
