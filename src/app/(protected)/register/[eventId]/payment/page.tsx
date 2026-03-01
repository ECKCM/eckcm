"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter, useParams } from "next/navigation";
import {
  Elements,
  PaymentElement,
  PaymentRequestButtonElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { Stripe as StripeType, PaymentRequest as StripePaymentRequest } from "@stripe/stripe-js";
import { getStripe, getStripeWithKey } from "@/lib/stripe/client";
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

export default function PaymentStep() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const registrationId = searchParams.get("registrationId");
  const confirmationCode = searchParams.get("code");

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [freeRegistration, setFreeRegistration] = useState(false);
  const [registrantName, setRegistrantName] = useState<string>("");
  const [registrantPhone, setRegistrantPhone] = useState<string>("");
  const [registrantEmail, setRegistrantEmail] = useState<string>("");
  const [stripePromise, setStripePromise] = useState<Promise<StripeType | null>>(
    () => getStripe()
  );
  const createIntentCalled = useRef(false);
  const [enabledMethods, setEnabledMethods] = useState<string[]>([
    "card", "ach", "zelle", "check", "wallet", "more",
  ]);
  const [donorCoversFees, setDonorCoversFees] = useState(false);
  const [coversFees, setCoversFees] = useState(false);
  const [feeCents, setFeeCents] = useState(0);
  const [baseAmount, setBaseAmount] = useState(0);
  const [updatingFees, setUpdatingFees] = useState(false);

  // Fetch enabled payment methods
  useEffect(() => {
    fetch("/api/payment/methods")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.enabled)) {
          setEnabledMethods(data.enabled);
        }
        if (data.donorCoversFees === true) {
          setDonorCoversFees(true);
        }
      })
      .catch(() => {
        // Keep defaults
      });
  }, []);

  // Fetch event-specific publishable key
  useEffect(() => {
    if (!eventId) return;
    fetch(`/api/stripe/publishable-key?eventId=${eventId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.publishableKey) {
          setStripePromise(getStripeWithKey(data.publishableKey));
        }
      })
      .catch(() => {
        // Fallback to env var key
      });
  }, [eventId]);

  useEffect(() => {
    if (!registrationId) return;
    if (createIntentCalled.current) return;
    createIntentCalled.current = true;

    async function createIntent() {
      try {
        const res = await fetch("/api/payment/create-intent", {
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
          if (res.status === 400 && data.error === "Invalid payment amount") {
            setFreeRegistration(true);
            setLoading(false);
            return;
          }
          setError(
            (data.error as string) ||
              `Failed to initialize payment (${res.status})`
          );
          setLoading(false);
          return;
        }

        setClientSecret(data.clientSecret as string);
        setAmount(data.amount as number);
        setBaseAmount(data.amount as number);
        if (data.registrantName) setRegistrantName(data.registrantName as string);
        if (data.registrantPhone) setRegistrantPhone(data.registrantPhone as string);
        if (data.registrantEmail) setRegistrantEmail(data.registrantEmail as string);
      } catch {
        setError("Network error. Please try again.");
      }
      setLoading(false);
    }

    createIntent();
  }, [registrationId]);

  if (!registrationId) {
    return (
      <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
        <WizardStepper currentStep={8} />
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <p className="text-destructive">
              No registration found. Please start a new registration.
            </p>
            <Button asChild>
              <Link href="/dashboard">Return to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleToggleCoverFees = async (checked: boolean) => {
    if (!registrationId) return;
    setCoversFees(checked);
    setUpdatingFees(true);
    try {
      const piId = clientSecret?.split("_secret_")[0] || undefined;
      const res = await fetch("/api/payment/update-cover-fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, coversFees: checked, paymentIntentId: piId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setCoversFees(!checked);
        toast.error(errData.error || "Failed to update fee coverage");
        return;
      }
      const data = await res.json();
      setAmount(data.amount);
      setFeeCents(data.feeCents);
    } catch {
      setCoversFees(!checked);
      toast.error("Network error");
    } finally {
      setUpdatingFees(false);
    }
  };

  const goToConfirmation = async (paymentIntentId?: string) => {
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
    router.push(
      `/register/${eventId}/confirmation?registrationId=${registrationId}&code=${confirmationCode || ""}${paymentIntentId ? "" : "&method=zelle"}`
    );
  };

  if (freeRegistration) {
    return (
      <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
        <WizardStepper currentStep={8} />
        <h2 className="text-xl font-bold text-center">
          Complete Registration
        </h2>
        <Card>
          <CardContent className="py-8 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <div>
              <p className="font-medium text-lg">No Payment Required</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your registration total is $0.00. No payment is needed.
              </p>
            </div>
            {confirmationCode && (
              <div className="pt-2">
                <p className="text-xs text-muted-foreground">
                  Confirmation Code
                </p>
                <p className="text-2xl font-mono font-bold tracking-wider">
                  {confirmationCode}
                </p>
              </div>
            )}
            <Button onClick={() => goToConfirmation()} size="lg" className="mt-4">
              Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Derive which modes are available from admin-enabled methods
  const stripeEnabled = enabledMethods.some((m) =>
    ["card", "ach", "check", "more"].includes(m)
  );
  const zelleEnabled = enabledMethods.includes("zelle");
  const walletEnabled = enabledMethods.includes("wallet");

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <WizardStepper currentStep={8} />
      <h2 className="text-xl font-bold text-center">Complete Payment</h2>

      {/* Order Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Order Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading...
            </div>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Confirmation Code</span>
                <span className="font-mono font-bold">{confirmationCode}</span>
              </div>
              <Separator className="my-3" />
              {coversFees && feeCents > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>${(baseAmount / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Processing fee</span>
                    <span>+${(feeCents / 100).toFixed(2)}</span>
                  </div>
                  <Separator className="my-2" />
                </>
              )}
              <div className="flex justify-between items-center">
                <span className="font-medium">Total Due</span>
                <span className="text-2xl font-bold">
                  ${(amount / 100).toFixed(2)}
                </span>
              </div>
              {donorCoversFees && (
                <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-dashed p-3 mt-3 hover:bg-muted/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={coversFees}
                    onChange={(e) => handleToggleCoverFees(e.target.checked)}
                    disabled={updatingFees}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
                  />
                  <span className="text-sm">
                    I&rsquo;d like to cover the payment processing fee.
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

      {/* Payment Form */}
      {loading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Initializing secure payment...
            </p>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <p className="text-destructive">{error}</p>
            <Button asChild variant="outline">
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      ) : clientSecret ? (
        <Elements
          stripe={stripePromise}
          options={{ clientSecret, appearance: STRIPE_APPEARANCE }}
        >
          <PaymentForm
            clientSecret={clientSecret}
            amount={amount}
            stripeEnabled={stripeEnabled}
            zelleEnabled={zelleEnabled}
            walletEnabled={walletEnabled}
            registrationId={registrationId}
            confirmationCode={confirmationCode || ""}
            registrantName={registrantName}
            registrantPhone={registrantPhone}
            registrantEmail={registrantEmail}
            onSuccess={(piId) => goToConfirmation(piId)}
            onCancel={() =>
              router.push(
                `/register/${eventId}/review?registrationId=${registrationId}&code=${confirmationCode || ""}`
              )
            }
          />
        </Elements>
      ) : null}

      {/* Security Badge */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4" />
        <span>
          Secured by Stripe. Your payment details are never stored on our
          servers.
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PaymentForm — PaymentElement + Zelle                               */
/* ------------------------------------------------------------------ */

type PayMode = "stripe" | "zelle";

function PaymentForm({
  clientSecret,
  amount,
  stripeEnabled,
  zelleEnabled,
  walletEnabled,
  registrationId,
  confirmationCode,
  registrantName,
  registrantPhone,
  registrantEmail,
  onSuccess,
  onCancel,
}: {
  clientSecret: string;
  amount: number;
  stripeEnabled: boolean;
  zelleEnabled: boolean;
  walletEnabled: boolean;
  registrationId: string;
  confirmationCode: string;
  registrantName: string;
  registrantPhone: string;
  registrantEmail: string;
  onSuccess: (paymentIntentId?: string) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [payMode, setPayMode] = useState<PayMode>(
    stripeEnabled ? "stripe" : "zelle"
  );
  const [processing, setProcessing] = useState(false);
  const [paymentRequest, setPaymentRequest] =
    useState<StripePaymentRequest | null>(null);
  const [walletAvailable, setWalletAvailable] = useState(false);
  const [zelleAgreed, setZelleAgreed] = useState(false);

  /* ---- Apple Pay / Google Pay via PaymentRequest API ---- */

  useEffect(() => {
    if (!stripe || !amount) return;

    const pr = stripe.paymentRequest({
      country: "US",
      currency: "usd",
      total: { label: "ECKCM Registration", amount },
      requestPayerName: true,
      requestPayerEmail: true,
    });

    pr.canMakePayment().then((result) => {
      if (result && (result.applePay || result.googlePay)) {
        setPaymentRequest(pr);
        setWalletAvailable(true);
      }
    });

    pr.on("paymentmethod", async (ev) => {
      const { error, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        { payment_method: ev.paymentMethod.id },
        { handleActions: false }
      );

      if (error) {
        ev.complete("fail");
        toast.error(error.message || "Payment failed.");
      } else {
        ev.complete("success");
        if (paymentIntent?.status === "requires_action") {
          const { error: confirmError, paymentIntent: confirmedPI } =
            await stripe.confirmCardPayment(clientSecret);
          if (confirmError) {
            toast.error(confirmError.message || "Payment failed.");
          } else {
            toast.success("Payment successful!");
            onSuccess(confirmedPI?.id);
          }
        } else {
          toast.success("Payment successful!");
          onSuccess(paymentIntent?.id);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe, amount]);

  /* ---- handlers ---- */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (payMode === "zelle") {
      setProcessing(true);
      try {
        await handleZelleSubmit();
      } catch (err) {
        console.error("[Payment] Unexpected error:", err);
        toast.error("An unexpected error occurred. Please try again.");
      }
      setProcessing(false);
      return;
    }

    if (!stripe || !elements) return;
    setProcessing(true);

    try {
      // Validate the PaymentElement form first
      const { error: submitError } = await elements.submit();
      if (submitError) {
        toast.error(submitError.message || "Please check your payment details.");
        setProcessing(false);
        return;
      }

      const returnUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/register/payment-complete`;
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });

      if (error) {
        toast.error(error.message || "Payment failed. Please try again.");
      } else if (
        paymentIntent?.status === "succeeded" ||
        paymentIntent?.status === "processing"
      ) {
        toast.success(
          paymentIntent.status === "processing"
            ? "Payment initiated! Processing may take a few days."
            : "Payment successful!"
        );
        onSuccess(paymentIntent.id);
      }
    } catch (err) {
      console.error("[Payment] Unexpected error:", err);
      toast.error("An unexpected error occurred. Please try again.");
    }

    setProcessing(false);
  };

  const handleZelleSubmit = async () => {
    const res = await fetch("/api/payment/zelle-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Failed to submit. Please try again.");
      return;
    }

    toast.success("Registration submitted! Please send your Zelle payment.");
    onSuccess();
  };

  /* ---- button label ---- */
  const buttonLabel = (() => {
    const amt = `$${(amount / 100).toFixed(2)}`;
    if (payMode === "zelle") return "Complete Registration";
    return `Pay ${amt}`;
  })();

  /* ---- render ---- */

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* ===== Apple Pay / Google Pay express buttons ===== */}
      {walletEnabled && walletAvailable && paymentRequest && (
        <>
          <div>
            <PaymentRequestButtonElement
              options={{
                paymentRequest,
                style: {
                  paymentRequestButton: {
                    type: "default",
                    theme: "dark",
                    height: "48px",
                  },
                },
              }}
            />
          </div>
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              or pay with
            </span>
            <Separator className="flex-1" />
          </div>
        </>
      )}

      {/* ===== Payment Mode Selector (Pay Online / Zelle) ===== */}
      {stripeEnabled && zelleEnabled && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPayMode("stripe")}
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
              <p className="text-sm font-medium leading-tight">Online Payment</p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Card, Bank, Amazon Pay, Klarna
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setPayMode("zelle")}
            className={`relative flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
              payMode === "zelle"
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-transparent bg-muted/40 hover:bg-muted/60"
            }`}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700 shrink-0">
              <Banknote className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight">Manual Payment</p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Zelle
              </p>
            </div>
          </button>
        </div>
      )}

      {/* ===== Stripe PaymentElement ===== */}
      {payMode === "stripe" && stripeEnabled && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Payment Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentElement
              options={{
                layout: {
                  type: "accordion",
                  defaultCollapsed: false,
                  radios: true,
                  spacedAccordionItems: true,
                },
                paymentMethodOrder: [
                  "card",
                  "us_bank_account",
                  "amazon_pay",
                  "klarna",
                ],
                wallets: { applePay: "never", googlePay: "never" },
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* ===== Manual Payment ===== */}
      {payMode === "zelle" && zelleEnabled && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Manual Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Zelle accordion-style container */}
            <div className="rounded-lg border overflow-hidden">
              {/* Radio header */}
              <div className="flex items-center gap-3 p-4 bg-background">
                <div className="h-4 w-4 rounded-full border-2 border-primary flex items-center justify-center shrink-0">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                </div>
                <ZelleIcon className="h-5 w-5 shrink-0" />
                <p className="text-sm font-medium">Zelle</p>
              </div>
              {/* Expanded content */}
              <div className="border-t px-4 pb-4 pt-3 space-y-3 bg-muted/20">
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-purple-800">
                    Zelle payments are processed manually. Your registration will be held
                    until payment is confirmed by our team.
                  </p>
                </div>
                <div className="space-y-2 text-sm text-purple-900 pl-1">
                  <p>1. Open your banking app and select <strong>Send with Zelle</strong></p>
                  <p className="flex items-center gap-1 flex-wrap">
                    <span>2. Zelle Payment Email:</span>
                    <CopyButton text="kimdani1@icloud.com" />
                  </p>
                  <p>3. Account Holder: <strong>EMPOWER MINISTRY GROUP, INC</strong></p>
                  <p>4. Amount: <strong className="font-mono">${(amount / 100).toFixed(2)}</strong></p>
                  <div className="space-y-1">
                    <p className="flex items-center gap-1 flex-wrap">
                      <span>5. Memo/Note <strong className="text-red-600">(Required)</strong>:</span>
                    </p>
                    <div className="pl-5">
                      <CopyButton text={`${confirmationCode} - ${registrantName} - ${registrantPhone.replace(/\D/g, "")} - ${registrantEmail}`} />
                    </div>
                    <p className="text-xs text-purple-700 pl-5">
                      Please copy and paste the memo exactly as shown so we can match your payment.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Important</p>
                    <p className="mt-0.5 text-amber-700">
                      Your registration will remain in &ldquo;Pending Payment&rdquo; status until
                      your Zelle payment is received and verified. This may take 1-3 business days.
                      Room assignments will not be made until payment is confirmed.
                    </p>
                  </div>
                </div>
                <label className="flex items-start gap-3 cursor-pointer rounded-lg border bg-background p-3">
                  <input
                    type="checkbox"
                    checked={zelleAgreed}
                    onChange={(e) => setZelleAgreed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
                  />
                  <span className="text-sm">
                    I agree to send the Zelle payment of{" "}
                    <strong className="font-mono">${(amount / 100).toFixed(2)}</strong>{" "}
                    with the memo/note shown above.
                  </span>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Pay / Cancel ===== */}
      <Button
        type="submit"
        disabled={
          (payMode === "stripe" && !stripe) ||
          processing ||
          (payMode === "zelle" && !zelleAgreed)
        }
        className="w-full"
        size="lg"
      >
        {processing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Processing...
          </>
        ) : (
          <>
            {payMode === "zelle" ? (
              <CheckCircle className="h-4 w-4 mr-2" />
            ) : (
              <Lock className="h-4 w-4 mr-2" />
            )}
            {buttonLabel}
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
        Cancel
      </Button>
    </form>
  );
}
