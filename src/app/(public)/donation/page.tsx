"use client";

import { useState, useRef, useEffect } from "react";
import {
  Elements,
  PaymentElement,
  ExpressCheckoutElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type {
  StripePaymentElementChangeEvent,
  Stripe as StripeType,
} from "@stripe/stripe-js";
import { getStripeWithKey } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
  CreditCard,
  Send,
  Banknote,
  Wallet,
  MapPin,
  StickyNote,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { sanitizeEmailInput, sanitizeLatinName } from "@/lib/utils/field-helpers";
import { formatCurrency } from "@/lib/utils/formatters";

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

// Zelle recipient — matches the registration payment flow.
const ZELLE_EMAIL = "kimdani1@icloud.com";

type PayMethod = "card" | "zelle" | "check" | "cash";

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

  /* ---- designation ---- */
  const [generalFund, setGeneralFund] = useState(true);

  /* ---- amount input ---- */
  const [amountInput, setAmountInput] = useState("");
  const [amountCents, setAmountCents] = useState<number | null>(null);

  /* ---- donor info (optional) ---- */
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");

  /* ---- payment method ---- */
  const [payMethod, setPayMethod] = useState<PayMethod>("card");

  /* ---- fees (card only) ---- */
  const [coversFees, setCoversFees] = useState(true);
  const [feeCents, setFeeCents] = useState(0);
  const [chargeAmount, setChargeAmount] = useState(0);

  /* ---- Stripe state (card) ---- */
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] =
    useState<Promise<StripeType | null> | null>(null);
  const [donationId, setDonationId] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);

  /* ---- manual flow (zelle/check/cash) ---- */
  const [showManual, setShowManual] = useState(false);
  const [submittingManual, setSubmittingManual] = useState(false);
  const [manualDone, setManualDone] = useState<PayMethod | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Any change to amount/method/designation invalidates an in-progress step.
  const resetStep = () => {
    setClientSecret(null);
    setDonationId(null);
    setShowManual(false);
  };

  const handleAmountSelect = (cents: number) => {
    setAmountCents(cents);
    setAmountInput((cents / 100).toFixed(2));
    resetStep();
  };

  const handleAmountInputChange = (val: string) => {
    const cleaned = val.replace(/[^0-9.]/g, "");
    setAmountInput(cleaned);
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num >= 1 && num <= 10000) {
      setAmountCents(Math.round(num * 100));
    } else {
      setAmountCents(null);
    }
    resetStep();
  };

  const designationMissing = !generalFund && !departmentId;
  const canContinue = !!amountCents && amountCents >= 100 && !designationMissing;

  const handleContinue = () => {
    if (!amountCents || amountCents < 100) {
      toast.error(t("donation.minAmountError"));
      return;
    }
    if (designationMissing) {
      toast.error(t("donation.selectDepartment"));
      return;
    }
    if (payMethod === "card") {
      handleProceedToCard();
    } else {
      setError(null);
      setShowManual(true);
    }
  };

  const handleProceedToCard = async () => {
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
          departmentId: generalFund ? undefined : departmentId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("donation.failedInit"));
        return;
      }
      // Set the mode-matched publishable key BEFORE clientSecret so Stripe
      // Elements mounts in the same mode (test/live) the PaymentIntent was
      // created in. Falls back to the static env key if the server omits it.
      setStripePromise(
        getStripeWithKey(
          data.publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
        )
      );
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

  const handleManualSubmit = async () => {
    if (!amountCents) return;
    setSubmittingManual(true);
    setError(null);
    try {
      const res = await fetch("/api/donation/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents,
          donorName: donorName || undefined,
          donorEmail: donorEmail || undefined,
          method: payMethod.toUpperCase(), // ZELLE | CHECK | CASH
          departmentId: generalFund ? undefined : departmentId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("donation.failedInit"));
        return;
      }
      setManualDone(payMethod);
      setSuccess(true);
    } catch {
      setError(t("donation.networkError"));
    } finally {
      setSubmittingManual(false);
    }
  };

  const resetAll = () => {
    setSuccess(false);
    setManualDone(null);
    setAmountInput("");
    setAmountCents(null);
    setClientSecret(null);
    setDonationId(null);
    setShowManual(false);
    setDonorName("");
    setDonorEmail("");
    setDepartmentId("");
    setGeneralFund(true);
    setPayMethod("card");
    setCoversFees(true);
  };

  /* ================================================================ */
  /*  Success                                                          */
  /* ================================================================ */
  if (success) {
    const isManual = manualDone !== null;
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-bold">
              {isManual ? t("donation.manualRecordedTitle") : t("donation.thankYou")}
            </h2>
            <p className="text-muted-foreground">
              {isManual
                ? t("donation.manualRecordedDesc", { amount: formatCurrency(amountCents ?? 0) })
                : t("donation.donationReceivedAmount", { amount: formatCurrency(amountCents ?? 0) })}
            </p>
            <p className="text-sm text-muted-foreground">
              {isManual ? t("donation.manualReceiptNote") : t("donation.receiptSent")}
            </p>
            <div className="pt-4 flex flex-col gap-2">
              <Button onClick={resetAll} variant="outline">
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

  /* ================================================================ */
  /*  Step 2 — card payment                                            */
  /* ================================================================ */
  if (clientSecret) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <PageHeader />
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  {t("donation.securePayment")}
                </span>
                <span className="text-2xl font-bold">{formatCurrency(chargeAmount)}</span>
              </CardTitle>
              {feeCents > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("donation.includesFee", { amount: (feeCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <Elements
                stripe={stripePromise}
                options={{ clientSecret, appearance: STRIPE_APPEARANCE, locale: "en" }}
                key={clientSecret}
              >
                <DonationCheckoutForm
                  donationId={donationId!}
                  onSuccess={() => setSuccess(true)}
                />
              </Elements>
            </CardContent>
          </Card>

          <Button variant="ghost" className="w-full" onClick={resetStep}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("donation.changeAmount")}
          </Button>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{t("donation.securedByStripe")}</span>
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  Step 2 — manual (zelle / check / cash)                           */
  /* ================================================================ */
  if (showManual) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <PageHeader />
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{t("donation.manualTitle")}</span>
                <span className="text-2xl font-bold">{formatCurrency(amountCents ?? 0)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {payMethod === "zelle" && (
                <div className="space-y-2">
                  <p className="font-medium">{t("donation.zelleHowTo")}</p>
                  <p className="text-muted-foreground">
                    {t("donation.zelleSendTo", { amount: formatCurrency(amountCents ?? 0) })}
                  </p>
                  <p className="rounded-md bg-muted px-3 py-2 font-mono text-sm">{ZELLE_EMAIL}</p>
                  <DonationMemoNote />
                </div>
              )}

              {payMethod === "check" && (
                <div className="space-y-3">
                  <div>
                    <p className="font-medium">{t("donation.checkPayableTo")}</p>
                    <p className="text-muted-foreground">ECKCM</p>
                  </div>
                  <div>
                    <p className="font-medium">{t("donation.checkMailTo")}</p>
                    <div className="text-muted-foreground leading-relaxed">
                      <p>ECKCM</p>
                      <p>574 Mountain Shadow Ln</p>
                      <p>Maryville, TN 37803</p>
                    </div>
                  </div>
                  <DonationMemoNote />
                  <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-900">
                    <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
                    <p className="text-sm">{t("donation.checkOrDesk")}</p>
                  </div>
                </div>
              )}

              {payMethod === "cash" && (
                <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-900">
                  <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
                  <p className="text-sm">{t("donation.cashDesk")}</p>
                </div>
              )}

              <p className="text-xs text-muted-foreground border-t pt-3">
                {t("donation.manualRecordNote")}
              </p>
            </CardContent>
          </Card>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}

          <Button
            onClick={handleManualSubmit}
            disabled={submittingManual}
            size="lg"
            className="w-full"
          >
            {submittingManual ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("donation.recording")}
              </>
            ) : (
              t("donation.recordDonation")
            )}
          </Button>

          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setShowManual(false)}
            disabled={submittingManual}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("donation.changeAmount")}
          </Button>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  Step 1 — amount, designation, method, info                      */
  /* ================================================================ */
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <PageHeader />

      <div className="space-y-6">
        {/* Amount */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("donation.donationAmount")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              {PRESET_AMOUNTS.map((cents) => (
                <Button
                  key={cents}
                  variant={amountCents === cents ? "default" : "outline"}
                  onClick={() => handleAmountSelect(cents)}
                  className="text-sm"
                >
                  {formatCurrency(cents, { decimals: 0 })}
                </Button>
              ))}
            </div>

            <div>
              <Label htmlFor="amount">{t("donation.customAmount")}</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
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
              <p className="text-xs text-muted-foreground mt-1">{t("donation.minMax")}</p>
            </div>

            {/* Cover fees — card only (Stripe processing fee) */}
            {payMethod === "card" && (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={coversFees}
                  onChange={(e) => setCoversFees(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                />
                <div>
                  <p className="text-sm font-medium">{t("donation.coverFees")}</p>
                  <p className="text-xs text-muted-foreground">{t("donation.coverFeesDesc")}</p>
                </div>
              </label>
            )}
          </CardContent>
        </Card>

        {/* Designation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("donation.designationTitle")}</CardTitle>
            <CardDescription>{t("donation.designationDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Option 1 — Camp Meeting (general) */}
            <button
              type="button"
              onClick={() => {
                setGeneralFund(true);
                setDepartmentId("");
                resetStep();
              }}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                generalFund ? "border-primary bg-primary/5" : "border-input hover:bg-muted/40"
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  generalFund ? "border-primary" : "border-muted-foreground/40"
                }`}
              >
                {generalFund && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <span>
                <span className="block text-sm font-medium">{t("donation.generalFund")}</span>
                <span className="block text-xs text-muted-foreground">{t("donation.generalFundDesc")}</span>
              </span>
            </button>

            {/* Option 2 — Department */}
            <button
              type="button"
              onClick={() => {
                setGeneralFund(false);
                resetStep();
              }}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                !generalFund ? "border-primary bg-primary/5" : "border-input hover:bg-muted/40"
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  !generalFund ? "border-primary" : "border-muted-foreground/40"
                }`}
              >
                {!generalFund && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <span>
                <span className="block text-sm font-medium">{t("donation.departmentOption")}</span>
                <span className="block text-xs text-muted-foreground">{t("donation.departmentOptionDesc")}</span>
              </span>
            </button>

            {!generalFund && (
              <div className="pl-7 pt-1">
                <Select
                  value={departmentId}
                  onValueChange={(v) => {
                    setDepartmentId(v);
                    resetStep();
                  }}
                >
                  <SelectTrigger>
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
          </CardContent>
        </Card>

        {/* Payment method */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("donation.paymentMethod")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: "card", icon: CreditCard, label: t("donation.methodCard") },
                { key: "zelle", icon: Send, label: t("donation.methodZelle") },
                { key: "check", icon: Banknote, label: t("donation.methodCheck") },
                { key: "cash", icon: Wallet, label: t("donation.methodCash") },
              ] as { key: PayMethod; icon: typeof CreditCard; label: string }[]).map((m) => {
                const Icon = m.icon;
                return (
                  <Button
                    key={m.key}
                    variant={payMethod === m.key ? "default" : "outline"}
                    onClick={() => {
                      setPayMethod(m.key);
                      resetStep();
                    }}
                    className="justify-start gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    {m.label}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Donor info */}
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
            <div>
              <Label htmlFor="donorName">{t("donation.donorName")}</Label>
              <Input
                id="donorName"
                value={donorName}
                onChange={(e) => setDonorName(sanitizeLatinName(e.target.value))}
                placeholder="Your name (English)"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("donation.nameEnglishOnly")}
              </p>
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
              <p className="text-xs text-muted-foreground mt-1">{t("donation.forReceiptOnly")}</p>
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}

        <Button
          onClick={handleContinue}
          disabled={!canContinue || loadingIntent}
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
              {payMethod === "card" ? t("donation.continueToPayment") : t("common.continue")}
              {amountCents && amountCents >= 100 && (
                <span className="ml-2">— {formatCurrency(amountCents)}</span>
              )}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared page header                                                 */
/* ------------------------------------------------------------------ */
function PageHeader() {
  const { t, locale } = useI18n();
  return (
    <>
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("donation.backToHome")}
      </Link>
      <div className="text-center mb-6">
        <Heart className="h-10 w-10 text-primary mx-auto mb-3" />
        <h1 className="text-3xl font-bold">{t("donation.makeDonation")}</h1>
        <p className="mt-2 text-muted-foreground">{t("donation.supportDesc")}</p>
      </div>

      {/* Preferred language — donation is a public page, so the selector lives
          here (no top-right account menu like the registration flow has). */}
      <div className="mb-8 flex flex-col items-center gap-2 rounded-lg border bg-muted/50 px-4 py-3">
        <div className="text-sm text-muted-foreground">
          {locale === "en" ? "Select your preferred language" : "언어를 선택하세요"}
        </div>
        <LanguageSwitcher variant="toggle" />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Memo note — asks Zelle/Check donors to tag their payment           */
/* ------------------------------------------------------------------ */
function DonationMemoNote() {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
      <StickyNote className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
      <div>
        <p className="text-sm">{t("donation.memoNote")}</p>
        <p className="mt-1.5 inline-block rounded bg-white/70 px-2 py-1 font-mono text-sm font-semibold">
          ECKCM Donation, {t("donation.memoName")}, {t("donation.memoPhone")}
        </p>
      </div>
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
  const [expressAvailable, setExpressAvailable] = useState(false);
  const processingRef = useRef(false);

  // Shared: confirm with Stripe (card OR Apple/Google Pay), then record it.
  const completePayment = async () => {
    if (!stripe || !elements) return;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    await completePayment();
  };

  // Apple Pay / Google Pay button tapped.
  const handleExpressConfirm = async () => {
    if (!stripe || !elements || processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    await completePayment();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Apple Pay / Google Pay — only renders when a wallet is available */}
      <ExpressCheckoutElement
        onConfirm={handleExpressConfirm}
        onReady={(event) => setExpressAvailable(!!event.availablePaymentMethods)}
        options={{
          paymentMethods: {
            applePay: "auto",
            googlePay: "auto",
            amazonPay: "never",
            link: "never",
            klarna: "never",
          } as Record<string, "auto" | "never">,
          buttonType: { applePay: "plain", googlePay: "plain" },
          buttonHeight: 48,
        }}
      />

      {expressAvailable && (
        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {t("payment.orPayWith")}
          </span>
          <Separator className="flex-1" />
        </div>
      )}

      {/* Card — wallets handled by ExpressCheckoutElement above */}
      <PaymentElement
        onChange={(e: StripePaymentElementChangeEvent) => {
          if (e.complete) setReady(true);
          else setReady(false);
        }}
        options={{
          paymentMethodOrder: ["card"],
          wallets: { applePay: "never", googlePay: "never" },
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
