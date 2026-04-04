"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter, useParams } from "next/navigation";
import {
  Elements,
  PaymentElement,
  ExpressCheckoutElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { Stripe as StripeType } from "@stripe/stripe-js";
import { getStripeWithKey } from "@/lib/stripe/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { WizardStepper } from "@/components/registration/wizard-stepper";
import { toast } from "sonner";
import Link from "next/link";
import {
  Loader2,
  Lock,
  CreditCard,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  Clock,
  Globe,
  Banknote,
} from "lucide-react";
import { STRIPE_APPEARANCE } from "./_components/payment-constants";
import { CopyButton } from "./_components/copy-button";
import { useRegistration } from "@/lib/context/registration-context";
import { useI18n } from "@/lib/i18n/context";

/* ------------------------------------------------------------------ */
/*  Zelle SVG icon                                                     */
/* ------------------------------------------------------------------ */
function ZelleIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className} fill="#6d1ed4">
      <path d="M13.559 24h-2.841a.483.483 0 0 1-.483-.483v-2.765H5.638a.667.667 0 0 1-.666-.666v-2.234a.67.67 0 0 1 .142-.412l8.139-10.382h-7.25a.667.667 0 0 1-.667-.667V3.914c0-.367.299-.666.666-.666h4.23V.483c0-.266.217-.483.483-.483h2.841c.266 0 .483.217.483.483v2.765h4.323c.367 0 .666.299.666.666v2.137a.67.67 0 0 1-.141.41l-8.19 10.481h7.665c.367 0 .666.299.666.666v2.477a.667.667 0 0 1-.666.667h-4.32v2.765a.483.483 0 0 1-.483.483" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

type PayMode = "stripe" | "zelle" | "check" | null;

export default function PaymentStep() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const registrationId = searchParams.get("registrationId");
  const confirmationCode = searchParams.get("code");
  const { suppressUnloadWarning } = useRegistration();
  const { t } = useI18n();

  /* ---- payment info (loaded without creating Stripe PI) ---- */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [freeRegistration, setFreeRegistration] = useState(false);
  const [amount, setAmount] = useState<number>(0);
  const [baseAmount, setBaseAmount] = useState<number>(0);
  const [invoiceTotal, setInvoiceTotal] = useState<number>(0);
  const [manualPaymentDiscount, setManualPaymentDiscount] = useState<number>(0);
  const [paymentTestMode, setPaymentTestMode] = useState(false);
  const [registrantName, setRegistrantName] = useState("");
  const [registrantPhone, setRegistrantPhone] = useState("");
  const [registrantEmail, setRegistrantEmail] = useState("");

  /* ---- Stripe state (populated lazily when stripe mode is selected) ---- */
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const createIntentCalled = useRef(false);
  const [stripePromise, setStripePromise] = useState<Promise<StripeType | null> | null>(
    null
  );

  /* ---- payment methods & fees ---- */
  const [enabledMethods, setEnabledMethods] = useState<string[]>([
    "card", "zelle", "wallet",
  ]);
  const [donorCoversFees, setDonorCoversFees] = useState(false);
  const [coversFees, setCoversFees] = useState(false);
  const [feeCents, setFeeCents] = useState(0);
  const [updatingFees, setUpdatingFees] = useState(false);

  /* ---- mode & processing ---- */
  const [payMode, setPayMode] = useState<PayMode>("stripe");
  const [processing, setProcessing] = useState(false);

  /* ---- selected method tracking ---- */
  const [stripeSelectedMethod, setStripeSelectedMethod] = useState("card");

  /* ---- refs for beforeunload cleanup (must track latest values) ---- */
  const clientSecretRef = useRef<string | null>(null);
  const paymentCompletedRef = useRef(false);
  const beforeUnloadHandlerRef = useRef<(() => void) | null>(null);

  /* ================================================================ */
  /*  Effects — all hooks MUST be before any early returns             */
  /* ================================================================ */

  // Fetch enabled payment methods
  useEffect(() => {
    fetch("/api/payment/methods")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.enabled)) setEnabledMethods(data.enabled);
        if (data.donorCoversFees === true) setDonorCoversFees(true);
      })
      .catch(() => {});
  }, []);

  // Fetch event-specific publishable key
  useEffect(() => {
    if (!eventId) return;
    fetch(`/api/stripe/publishable-key?eventId=${eventId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.publishableKey) setStripePromise(getStripeWithKey(data.publishableKey));
      })
      .catch(() => {});
  }, [eventId]);

  // Step 1: Load payment info (no Stripe PI created)
  useEffect(() => {
    if (!registrationId) return;

    async function loadInfo() {
      try {
        const res = await fetch("/api/payment/info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registrationId }),
        });

        const text = await res.text();
        let data: Record<string, unknown> = {};
        try {
          data = JSON.parse(text);
        } catch {
          /* non-JSON */
        }

        if (!res.ok) {
          setError(
            (data.error as string) ||
              `Failed to load payment info (${res.status})`
          );
          setLoading(false);
          return;
        }

        if (data.freeRegistration) {
          setFreeRegistration(true);
          setLoading(false);
          return;
        }

        setAmount(data.amount as number);
        setBaseAmount(data.amount as number);
        setInvoiceTotal((data.invoiceTotal as number) || 0);
        setManualPaymentDiscount((data.manualPaymentDiscount as number) || 0);
        if (data.paymentTestMode) setPaymentTestMode(true);
        if (data.registrantName) setRegistrantName(data.registrantName as string);
        if (data.registrantPhone) setRegistrantPhone(data.registrantPhone as string);
        if (data.registrantEmail) setRegistrantEmail(data.registrantEmail as string);
      } catch {
        setError("Network error. Please try again.");
      }
      setLoading(false);
    }

    loadInfo();
  }, [registrationId]);

  // Step 2: Create Stripe PI lazily ONLY when stripe mode is active
  useEffect(() => {
    if (payMode !== "stripe") return;
    if (loading || error || freeRegistration || !registrationId) return;
    if (clientSecret || createIntentCalled.current) return;
    createIntentCalled.current = true;

    async function createIntent() {
      try {
        const res = await fetch("/api/payment/create-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registrationId }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(
            (data.error as string) || "Failed to initialize payment"
          );
          return;
        }
        // Set publishable key before clientSecret so Elements mounts with correct mode
        if (data.publishableKey) {
          setStripePromise(getStripeWithKey(data.publishableKey));
        }
        setClientSecret(data.clientSecret as string);
        setAmount(data.amount as number);
        setBaseAmount(data.amount as number);
      } catch {
        setError("Network error. Please try again.");
      }
    }

    createIntent();
  }, [payMode, loading, error, freeRegistration, registrationId, clientSecret]);

  // Keep ref in sync with clientSecret
  useEffect(() => {
    clientSecretRef.current = clientSecret;
  }, [clientSecret]);

  // Cancel orphaned Stripe PI + DRAFT registration when user closes/refreshes
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (paymentCompletedRef.current) return;

      // Cancel Stripe PI
      const cs = clientSecretRef.current;
      if (cs) {
        const piId = cs.split("_secret_")[0];
        navigator.sendBeacon(
          "/api/payment/cancel-intent",
          new Blob(
            [JSON.stringify({ paymentIntentId: piId })],
            { type: "application/json" }
          )
        );
      }

      // Cancel DRAFT registration
      if (registrationId && eventId) {
        navigator.sendBeacon(
          "/api/registration/cancel-drafts",
          new Blob(
            [JSON.stringify({ eventId, registrationId })],
            { type: "application/json" }
          )
        );
      }
    };
    beforeUnloadHandlerRef.current = handleBeforeUnload;
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      beforeUnloadHandlerRef.current = null;
    };
  }, [registrationId, eventId]);

  // Cancel DRAFT registration on in-app navigation away (unmount)
  // Use a mounted ref with a delay to avoid React Strict Mode's double-mount cycle
  const reallyMountedRef = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      reallyMountedRef.current = true;
    }, 500);
    return () => {
      clearTimeout(timer);
      if (!reallyMountedRef.current) return; // Strict Mode double-mount, skip
      if (paymentCompletedRef.current) return;
      if (!registrationId || !eventId) return;
      fetch("/api/registration/cancel-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, registrationId }),
        keepalive: true,
      }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrationId, eventId]);

  // Derive which modes are available
  const stripeEnabled = enabledMethods.includes("card");
  const zelleEnabled = enabledMethods.includes("zelle");
  // Auto-select payMode when only one option is available
  useEffect(() => {
    if (stripeEnabled && !zelleEnabled) setPayMode("stripe");
    else if (!stripeEnabled && zelleEnabled) setPayMode("zelle");
  }, [stripeEnabled, zelleEnabled]);

  /* ================================================================ */
  /*  Handlers                                                         */
  /* ================================================================ */

  const handleToggleCoverFees = async (checked: boolean) => {
    if (!registrationId || !clientSecret) return;
    setCoversFees(checked);
    setUpdatingFees(true);
    try {
      const piId = clientSecret.split("_secret_")[0];
      const res = await fetch("/api/payment/update-cover-fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, coversFees: checked, paymentIntentId: piId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setCoversFees(!checked);
        toast.error(errData.error || t("payment.failedUpdateFees"));
        return;
      }
      const data = await res.json();
      setAmount(data.amount);
      setFeeCents(data.feeCents);
    } catch {
      setCoversFees(!checked);
      toast.error(t("payment.networkErrorShort"));
    } finally {
      setUpdatingFees(false);
    }
  };

  const goToConfirmation = async (paymentIntentId?: string) => {
    paymentCompletedRef.current = true;
    sessionStorage.removeItem("eckcm_registration");
    if (paymentIntentId && registrationId) {
      try {
        const res = await fetch("/api/payment/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registrationId, paymentIntentId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error("[payment] confirm failed:", res.status, err);
        }
      } catch (err) {
        console.error("[payment] confirm fetch error:", err);
      }
    }
    const params = new URLSearchParams({
      registrationId: registrationId!,
      code: confirmationCode || "",
    });
    if (!paymentIntentId) params.set("method", payMode === "check" ? "check" : "zelle");
    router.push(`/register/${eventId}/confirmation?${params.toString()}`);
  };

  // Cancel PI + DRAFT registration, then go back to start fresh
  const cancelPaymentAndGoBack = async () => {
    // Mark as completed to prevent useEffect cleanup from double-cancelling
    paymentCompletedRef.current = true;

    const cs = clientSecretRef.current;
    if (cs) {
      const piId = cs.split("_secret_")[0];
      try {
        await fetch("/api/payment/cancel-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentIntentId: piId }),
        });
      } catch (err) {
        console.error("[Payment] cancel-intent error:", err);
      }
    }

    // Cancel the DRAFT registration
    if (registrationId && eventId) {
      try {
        await fetch("/api/registration/cancel-drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, registrationId }),
        });
      } catch (err) {
        console.error("[Payment] cancel-drafts error:", err);
      }
    }

    // Clear saved registration data so user starts fresh
    sessionStorage.removeItem("eckcm_registration");

    router.push(`/register/${eventId}`);
  };

  /* ---- derived values ---- */
  const zelleAmount = manualPaymentDiscount > 0
    ? Math.max(0, invoiceTotal - manualPaymentDiscount)
    : invoiceTotal || amount;

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  if (!registrationId) {
    return (
      <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
        <WizardStepper currentStep={8} />
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <p className="text-destructive">
              {t("payment.noRegistration")}
            </p>
            <Button asChild>
              <Link href="/dashboard">{t("payment.returnToDashboard")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (freeRegistration) {
    return (
      <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
        <WizardStepper currentStep={8} />
        <h2 className="text-xl font-bold text-center">
          {t("payment.completeRegistration")}
        </h2>
        <Card>
          <CardContent className="py-8 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <div>
              <p className="font-medium text-lg">{t("payment.noPaymentRequired")}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("payment.noPaymentDesc")}
              </p>
            </div>
            {confirmationCode && (
              <div className="pt-2">
                <p className="text-xs text-muted-foreground">
                  {t("registration.confirmationCode")}
                </p>
                <p className="text-2xl font-mono font-bold tracking-wider">
                  {confirmationCode}
                </p>
              </div>
            )}
            <Button onClick={() => goToConfirmation()} size="lg" className="mt-4">
              {t("common.continue")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      {/* Full-screen processing overlay */}
      {processing && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">
            {t("payment.processingPayment")}
          </p>
        </div>
      )}

      <WizardStepper currentStep={8} />
      <h2 className="text-xl font-bold text-center">{t("payment.completePayment")}</h2>

      {/* Order Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            {t("payment.orderSummary")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {t("common.loading")}
            </div>
          ) : error ? null : (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("registration.confirmationCode")}</span>
                <span className="font-mono font-bold">{confirmationCode}</span>
              </div>
              <Separator className="my-3" />
              {payMode === "stripe" && coversFees && feeCents > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("payment.subtotal")}</span>
                    <span>${(baseAmount / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{t("payment.processingFee")}</span>
                    <span>+${(feeCents / 100).toFixed(2)}</span>
                  </div>
                  <Separator className="my-2" />
                </>
              )}
              {(payMode === "zelle" || payMode === "check") && manualPaymentDiscount > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("payment.subtotal")}</span>
                    <span>${((invoiceTotal || amount) / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-green-700">
                    <span>{t("payment.manualDiscount")}</span>
                    <span>-${(manualPaymentDiscount / 100).toFixed(2)}</span>
                  </div>
                  <Separator className="my-2" />
                </>
              )}
              <div className="flex justify-between items-center">
                <span className="font-medium">{t("payment.totalDue")}</span>
                <span className="text-2xl font-bold">
                  {(payMode === "zelle" || payMode === "check") && manualPaymentDiscount > 0
                    ? `$${(Math.max(0, (invoiceTotal || amount) - manualPaymentDiscount) / 100).toFixed(2)}`
                    : `$${(amount / 100).toFixed(2)}`}
                </span>
              </div>
              {donorCoversFees && payMode === "stripe" && clientSecret && (
                <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-dashed p-3 mt-3 hover:bg-muted/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={coversFees}
                    onChange={(e) => handleToggleCoverFees(e.target.checked)}
                    disabled={updatingFees}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
                  />
                  <span className="text-sm">
                    {t("payment.coverFees")}
                    {!coversFees && baseAmount > 0 && (
                      <span className="text-muted-foreground">
                        {" "}(+${(Math.ceil((baseAmount + 30) / (1 - 0.029) - baseAmount) / 100).toFixed(2)})
                      </span>
                    )}
                  </span>
                  {updatingFees && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
                </label>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Loading state */}
      {loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              {t("payment.loadingPayment")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {!loading && error && (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <p className="text-destructive">{error}</p>
            <Button asChild variant="outline">
              <Link href="/dashboard">{t("common.goToDashboard")}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Payment forms — only after info is loaded */}
      {!loading && !error && (
        <>
          {/* Payment Mode Selector */}
          {stripeEnabled && zelleEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setPayMode("stripe");
                  setStripeSelectedMethod("card");
                }}
                className={`relative flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                  payMode === "stripe"
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-transparent bg-muted/40 hover:bg-muted/60"
                }`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700 shrink-0">
                  <Globe className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{t("payment.onlinePayment")}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    {t("payment.cardAmazon")}
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setPayMode("zelle")}
                className={`relative flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                  payMode === "zelle" || payMode === "check"
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-transparent bg-muted/40 hover:bg-muted/60"
                }`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700 shrink-0">
                  <Banknote className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{t("payment.manualPayment")}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    {t("payment.zelleCheck")}
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* === Stripe Payment Form (inside Elements, only when PI exists) === */}
          {payMode === "stripe" && stripeEnabled && (
            clientSecret && stripePromise ? (
              <Elements
                stripe={stripePromise}
                options={{ clientSecret, appearance: STRIPE_APPEARANCE }}
              >
                <StripePaymentForm
                  clientSecret={clientSecret}
                  amount={amount}
                  registrationId={registrationId!}
                  coversFees={coversFees}
                  processing={processing}
                  setProcessing={setProcessing}
                  onPaymentMethodChange={(method) => {
                    setStripeSelectedMethod(method);
                  }}
                  onAmountUpdate={(newAmount) => {
                    setAmount(newAmount);
                  }}
                  onSuccess={(piId) => goToConfirmation(piId)}
                  onCancel={cancelPaymentAndGoBack}
                  onPaymentFailed={cancelPaymentAndGoBack}
                  beforeUnloadHandlerRef={beforeUnloadHandlerRef}
                  suppressUnloadWarning={suppressUnloadWarning}
                  registrantEmail={registrantEmail}
                  registrantName={registrantName}
                />
              </Elements>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    {t("payment.initializingPayment")}
                  </p>
                </CardContent>
              </Card>
            )
          )}

          {/* === Manual Payment Form (standalone, no Stripe Elements needed) === */}
          {(payMode === "zelle" || payMode === "check") && zelleEnabled && (
            <ManualPaymentForm
              payMode={payMode as "zelle" | "check"}
              setPayMode={setPayMode}
              registrationId={registrationId!}
              confirmationCode={confirmationCode || ""}
              registrantName={registrantName}
              registrantPhone={registrantPhone}
              registrantEmail={registrantEmail}
              manualAmount={zelleAmount}
              processing={processing}
              setProcessing={setProcessing}
              onSuccess={() => goToConfirmation()}
              onCancel={cancelPaymentAndGoBack}
            />
          )}
        </>
      )}

      {/* Security Badge */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4" />
        <span>
          {t("payment.securedByStripe")}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  StripePaymentForm — inside Elements provider                       */
/* ------------------------------------------------------------------ */

function StripePaymentForm({
  clientSecret,
  amount,
  registrationId,
  coversFees,
  processing,
  setProcessing,
  onPaymentMethodChange,
  onAmountUpdate,
  onSuccess,
  onCancel,
  onPaymentFailed,
  beforeUnloadHandlerRef,
  suppressUnloadWarning,
  registrantEmail,
  registrantName,
}: {
  clientSecret: string;
  amount: number;
  registrationId: string;
  coversFees: boolean;
  processing: boolean;
  setProcessing: (v: boolean) => void;
  onPaymentMethodChange: (method: string) => void;
  onAmountUpdate: (amount: number) => void;
  onSuccess: (paymentIntentId: string) => void;
  onCancel: () => void;
  onPaymentFailed: () => void;
  beforeUnloadHandlerRef: React.MutableRefObject<(() => void) | null>;
  suppressUnloadWarning: React.MutableRefObject<boolean>;
  registrantEmail: string;
  registrantName: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { t } = useI18n();
  const [selectedMethod, setSelectedMethod] = useState("card");
  const abortRef = useRef<AbortController | null>(null);
  const isFirstMount = useRef(true);

  // When selectedMethod changes, update PI amount on server
  // Skips first mount — PI restoration is handled by the parent when switching from Zelle
  useEffect(() => {
    if (!clientSecret || !registrationId) return;

    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const piId = clientSecret.split("_secret_")[0];
    fetch("/api/payment/update-method-discount", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        registrationId,
        paymentIntentId: piId,
        selectedMethod,
        coversFees,
      }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (!controller.signal.aborted && data.amount) {
          onAmountUpdate(data.amount);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("[payment] method discount update failed:", err);
        }
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMethod]);

  /* ---- submit ---- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        toast.error(submitError.message || t("payment.checkPaymentDetails"));
        setProcessing(false);
        return;
      }

      const returnUrl = `${window.location.origin}/register/payment-complete`;

      // Suppress "Leave site?" dialog during redirect (Amazon Pay, etc.)
      suppressUnloadWarning.current = true;
      if (beforeUnloadHandlerRef.current) {
        window.removeEventListener("beforeunload", beforeUnloadHandlerRef.current);
      }

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: returnUrl,
          payment_method_data: {
            billing_details: {
              ...(registrantEmail ? { email: registrantEmail } : {}),
              ...(registrantName ? { name: registrantName } : {}),
            },
          },
        },
        redirect: "if_required",
      });

      // If confirmPayment returned (no redirect, e.g. card), restore warnings
      suppressUnloadWarning.current = false;
      if (beforeUnloadHandlerRef.current) {
        window.addEventListener("beforeunload", beforeUnloadHandlerRef.current);
      }

      if (error) {
        console.error("[Payment] Stripe error:", error.type, error.code, error.message);
        toast.error(error.message || t("payment.paymentFailed"));
        setProcessing(false);
        onPaymentFailed();
        return;
      } else if (paymentIntent?.status === "succeeded") {
        toast.success(t("payment.paymentSuccess"));
        onSuccess(paymentIntent.id);
      } else {
        setProcessing(false);
      }
    } catch (err) {
      console.error("[Payment] Unexpected error:", err);
      toast.error(t("payment.unexpectedError"));
      setProcessing(false);
      onPaymentFailed();
    }
  };

  /* ---- Express Checkout (Apple Pay / Google Pay black buttons) ---- */
  const handleExpressCheckout = async ({ expressPaymentType }: { expressPaymentType: string }) => {
    if (!stripe || !elements) return;
    setProcessing(true);

    try {
      const returnUrl = `${window.location.origin}/register/payment-complete`;

      suppressUnloadWarning.current = true;
      if (beforeUnloadHandlerRef.current) {
        window.removeEventListener("beforeunload", beforeUnloadHandlerRef.current);
      }

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: returnUrl,
        },
        redirect: "if_required",
      });

      suppressUnloadWarning.current = false;
      if (beforeUnloadHandlerRef.current) {
        window.addEventListener("beforeunload", beforeUnloadHandlerRef.current);
      }

      if (error) {
        console.error(`[Payment] ${expressPaymentType} error:`, error.type, error.code, error.message);
        toast.error(error.message || t("payment.paymentFailed"));
        setProcessing(false);
        onPaymentFailed();
      } else if (
        paymentIntent?.status === "succeeded" ||
        paymentIntent?.status === "processing"
      ) {
        toast.success(t("payment.paymentSuccess"));
        onSuccess(paymentIntent.id);
      } else {
        setProcessing(false);
      }
    } catch (err) {
      console.error("[Payment] Express checkout error:", err);
      toast.error(t("payment.unexpectedError"));
      setProcessing(false);
      onPaymentFailed();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Express Checkout — Apple Pay / Google Pay black buttons */}
      <ExpressCheckoutElement
        onConfirm={handleExpressCheckout}
        options={{
          paymentMethods: {
            applePay: "auto",
            googlePay: "auto",
            amazonPay: "never",
            link: "never",
            klarna: "never",
          } as Record<string, "auto" | "never">,
          buttonType: {
            applePay: "plain",
            googlePay: "plain",
          },
          buttonHeight: 48,
        }}
      />

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {t("payment.orPayWith")}
        </span>
        <Separator className="flex-1" />
      </div>

      {/* PaymentElement — card, bank, etc. (wallets handled by ExpressCheckoutElement above) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" />
            {t("payment.paymentDetails")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentElement
            onChange={(event) => {
              const method = event.value.type;
              if (method !== selectedMethod) {
                setSelectedMethod(method);
                onPaymentMethodChange(method);
              }
            }}
            options={{
              layout: {
                type: "accordion",
                defaultCollapsed: false,
                radios: true,
                spacedAccordionItems: true,
              },
              paymentMethodOrder: ["card"],
              wallets: { applePay: "never", googlePay: "never" },
            }}
          />
        </CardContent>
      </Card>

      {/* Pay button */}
      <Button
        type="submit"
        disabled={!stripe || processing}
        className="w-full"
        size="lg"
      >
        {processing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            {t("common.processing")}
          </>
        ) : (
          <>
            <Lock className="h-4 w-4 mr-2" />
            Pay ${(amount / 100).toFixed(2)}
          </>
        )}
      </Button>

      <Button
        type="button"
        variant="ghost"
        className="w-full"
        size="lg"
        disabled={processing}
        onClick={onCancel}
      >
        {t("common.cancel")}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  ManualPaymentForm — Zelle & Check, radio-selectable in one Card    */
/* ------------------------------------------------------------------ */

function ManualPaymentForm({
  payMode,
  setPayMode,
  registrationId,
  confirmationCode,
  registrantName,
  registrantPhone,
  registrantEmail,
  manualAmount,
  processing,
  setProcessing,
  onSuccess,
  onCancel,
}: {
  payMode: "zelle" | "check";
  setPayMode: (mode: PayMode) => void;
  registrationId: string;
  confirmationCode: string;
  registrantName: string;
  registrantPhone: string;
  registrantEmail: string;
  manualAmount: number;
  processing: boolean;
  setProcessing: (v: boolean) => void;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [agreed, setAgreed] = useState(false);

  /* ---- Zelle payer info (memo generator) ---- */
  const [zellePayerName, setZellePayerName] = useState(registrantName);
  const [zellePayerPhone, setZellePayerPhone] = useState(registrantPhone.replace(/\D/g, ""));
  const [zellePayerEmail, setZellePayerEmail] = useState(registrantEmail);

  const zellePayerValid = zellePayerName.trim() !== "" && zellePayerPhone.replace(/\D/g, "") !== "" && zellePayerEmail.trim() !== "";
  const zelleMemo = `${confirmationCode}-${zellePayerName.replace(/\s+/g, "").toUpperCase()}-${zellePayerPhone.replace(/\D/g, "")}-${zellePayerEmail.replace(/[@.]/g, "").toLowerCase()}`;

  const handleMethodChange = (method: "zelle" | "check") => {
    setAgreed(false);
    setPayMode(method);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    try {
      const endpoint =
        payMode === "check"
          ? "/api/payment/check-submit"
          : "/api/payment/zelle-submit";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationId,
          ...(payMode === "zelle" && {
            zellePayerName: zellePayerName.trim(),
            zellePayerPhone: zellePayerPhone.replace(/\D/g, ""),
            zellePayerEmail: zellePayerEmail.trim(),
          }),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t("payment.failedSubmit"));
        setProcessing(false);
        return;
      }

      toast.success(
        payMode === "check"
          ? t("payment.checkSubmitted")
          : t("payment.zelleSubmitted")
      );
      onSuccess();
    } catch (err) {
      console.error("[Payment] Unexpected error:", err);
      toast.error(t("payment.unexpectedError"));
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" />
            {t("payment.manualPayment")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Zelle option */}
          <div className="rounded-lg border overflow-hidden">
            <button
              type="button"
              onClick={() => handleMethodChange("zelle")}
              className="w-full flex items-center gap-3 p-4 bg-background text-left"
            >
              <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                payMode === "zelle" ? "border-primary" : "border-muted-foreground/40"
              }`}>
                {payMode === "zelle" && <div className="h-2 w-2 rounded-full bg-primary" />}
              </div>
              <ZelleIcon className="h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">{t("payment.zelleTitle")}</p>
            </button>
            {payMode === "zelle" && (
              <div className="border-t px-4 pb-4 pt-3 space-y-3 bg-muted/20">
                {/* Critical warning: must click button AFTER Zelle send */}
                <div className="flex gap-2 rounded-lg border-2 border-red-400 bg-red-50 p-3 text-sm text-red-900">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-red-600" />
                  <div>
                    <p className="font-bold">{t("payment.zelleFlowWarningTitle")}</p>
                    <p className="mt-1 text-red-800">
                      {t("payment.zelleFlowWarning1")}
                    </p>
                    <p className="mt-1 font-semibold text-red-900">
                      {t("payment.zelleFlowWarning2")}
                    </p>
                    <p className="mt-1.5 text-xs text-red-700">
                      {t("payment.zelleFlowWarning3")}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-purple-800">
                    {t("payment.zelleDesc")}
                  </p>
                </div>
                <div className="space-y-2 text-sm text-purple-900 pl-1">
                  <p>{t("payment.zelleStep1")}</p>
                  <p className="flex items-center gap-1 flex-wrap">
                    <span>{t("payment.zelleStep2")}</span>
                    <CopyButton text="kimdani1@icloud.com" />
                  </p>
                  <p>{t("payment.zelleStep3")}</p>
                  <p>{t("payment.zelleStep4")} <strong className="font-mono">${(manualAmount / 100).toFixed(2)}</strong></p>

                  {/* Zelle Memo Generator */}
                  <div className="space-y-2">
                    <p className="font-semibold">{t("payment.zelleStep5")}</p>

                    {/* Payer info section */}
                    <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3 space-y-2">
                      <p className="text-xs font-semibold text-purple-800 flex items-center gap-1">
                        <ZelleIcon className="h-3.5 w-3.5 shrink-0" />
                        {t("payment.zellePayerInfo")}
                      </p>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs font-medium text-purple-800">{t("payment.zellePayerName")}</label>
                          <input
                            type="text"
                            value={zellePayerName}
                            onChange={(e) => setZellePayerName(e.target.value)}
                            className={`mt-0.5 w-full rounded-md border bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 ${
                              zellePayerName.trim() === "" ? "border-red-400 focus:border-red-500 focus:ring-red-500" : "border-purple-300 focus:border-purple-500 focus:ring-purple-500"
                            }`}
                          />
                          {zellePayerName.trim() === "" && <p className="text-xs text-red-500 mt-0.5">{t("payment.zellePayerRequired")}</p>}
                        </div>
                        <div>
                          <label className="text-xs font-medium text-purple-800">{t("payment.zellePayerPhone")}</label>
                          <input
                            type="tel"
                            value={zellePayerPhone}
                            onChange={(e) => setZellePayerPhone(e.target.value.replace(/\D/g, ""))}
                            placeholder="19519661889"
                            className={`mt-0.5 w-full rounded-md border bg-white px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 ${
                              zellePayerPhone.replace(/\D/g, "") === "" ? "border-red-400 focus:border-red-500 focus:ring-red-500" : "border-purple-300 focus:border-purple-500 focus:ring-purple-500"
                            }`}
                          />
                          {zellePayerPhone.replace(/\D/g, "") === "" && <p className="text-xs text-red-500 mt-0.5">{t("payment.zellePayerRequired")}</p>}
                        </div>
                        <div>
                          <label className="text-xs font-medium text-purple-800">{t("payment.zellePayerEmail")}</label>
                          <input
                            type="email"
                            value={zellePayerEmail}
                            onChange={(e) => setZellePayerEmail(e.target.value)}
                            className={`mt-0.5 w-full rounded-md border bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 ${
                              zellePayerEmail.trim() === "" ? "border-red-400 focus:border-red-500 focus:ring-red-500" : "border-purple-300 focus:border-purple-500 focus:ring-purple-500"
                            }`}
                          />
                          {zellePayerEmail.trim() === "" && <p className="text-xs text-red-500 mt-0.5">{t("payment.zellePayerRequired")}</p>}
                        </div>
                      </div>
                    </div>

                    {/* Generated memo with copy button */}
                    <div className="pl-1">
                      <CopyButton text={zelleMemo} />
                    </div>
                    <p className="text-xs text-purple-700 pl-1">
                      {t("payment.zelleMemoHint")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">{t("payment.zelleImportant")}</p>
                    <p className="mt-0.5 text-amber-700">
                      {t("payment.zelleWarning")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Check option */}
          <div className="rounded-lg border overflow-hidden">
            <button
              type="button"
              onClick={() => handleMethodChange("check")}
              className="w-full flex items-center gap-3 p-4 bg-background text-left"
            >
              <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                payMode === "check" ? "border-primary" : "border-muted-foreground/40"
              }`}>
                {payMode === "check" && <div className="h-2 w-2 rounded-full bg-primary" />}
              </div>
              <Banknote className="h-5 w-5 shrink-0 text-emerald-700" />
              <p className="text-sm font-medium">{t("payment.checkTitle")}</p>
            </button>
            {payMode === "check" && (
              <div className="border-t px-4 pb-4 pt-3 space-y-3 bg-muted/20">
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-emerald-800">
                    {t("payment.checkDesc")}
                  </p>
                </div>
                <div className="space-y-2 text-sm text-emerald-900 pl-1">
                  <p>{t("payment.checkStep1")}</p>
                  <p>{t("payment.checkStep2")} <strong className="font-mono">${(manualAmount / 100).toFixed(2)}</strong></p>
                  <p>{t("payment.checkStep3")} <strong>{confirmationCode}</strong></p>
                  <p>{t("payment.checkStep4")}</p>
                  <div className="pl-5 text-sm font-medium">
                    <p>ECKCM</p>
                    <p>574 Mountain Shadow Ln</p>
                    <p>Maryville, TN 37803</p>
                  </div>
                </div>
                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">{t("payment.checkImportant")}</p>
                    <p className="mt-0.5 text-amber-700">
                      {t("payment.checkWarning")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Agreement checkbox */}
          <label className="flex items-start gap-3 cursor-pointer rounded-lg border bg-background p-3">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
            />
            <span className="text-sm">
              {(() => {
                const amt = `$${(manualAmount / 100).toFixed(2)}`;
                const text = payMode === "check"
                  ? t("payment.checkAgree", { amount: amt, code: confirmationCode })
                  : t("payment.zelleAgree", { amount: amt });
                const idx = text.indexOf(amt);
                if (idx === -1) return text;
                return (
                  <>
                    {text.slice(0, idx)}
                    <strong className="font-mono">{amt}</strong>
                    {text.slice(idx + amt.length)}
                  </>
                );
              })()}
            </span>
          </label>
        </CardContent>
      </Card>

      {/* Submit button */}
      <Button
        type="submit"
        disabled={!agreed || processing || (payMode === "zelle" && !zellePayerValid)}
        className="w-full"
        size="lg"
      >
        {processing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            {t("common.processing")}
          </>
        ) : (
          <>
            <CheckCircle className="h-4 w-4 mr-2" />
            {t("payment.completeRegistration")}
          </>
        )}
      </Button>

      <Button
        type="button"
        variant="ghost"
        className="w-full"
        size="lg"
        disabled={processing}
        onClick={onCancel}
      >
        {t("common.cancel")}
      </Button>
    </form>
  );
}
