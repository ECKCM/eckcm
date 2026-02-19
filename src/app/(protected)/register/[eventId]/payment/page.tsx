"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter, useParams } from "next/navigation";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  PaymentRequestButtonElement,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { Stripe as StripeType, PaymentRequest as StripePaymentRequest } from "@stripe/stripe-js";
import { getStripe, getStripeWithKey } from "@/lib/stripe/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { WizardStepper } from "@/components/registration/wizard-stepper";
import { CheckVisual } from "@/components/payment/check-visual";
import { toast } from "sonner";
import Link from "next/link";
import {
  Loader2,
  Lock,
  CreditCard,
  Landmark,
  Building2,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  CircleCheck,
  ChevronDown,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Payment method definitions (main methods only)                     */
/* ------------------------------------------------------------------ */

type MethodId = "card" | "check" | "ach";

interface PaymentMethodDef {
  id: MethodId;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  iconBg: string;
}

const STRIPE_EL_STYLE = {
  base: {
    fontSize: "16px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: "#0f172a",
    "::placeholder": { color: "#94a3b8" },
    lineHeight: "24px",
  },
  invalid: { color: "#ef4444", iconColor: "#ef4444" },
};

const MAIN_METHODS: PaymentMethodDef[] = [
  {
    id: "card",
    label: "Card",
    sublabel: "Visa, Mastercard, Amex",
    icon: <CreditCard className="h-5 w-5" />,
    iconBg: "bg-slate-100 text-slate-700",
  },
  {
    id: "check",
    label: "Bank Check",
    sublabel: "ACH Direct Debit",
    icon: <Landmark className="h-5 w-5" />,
    iconBg: "bg-teal-100 text-teal-700",
  },
  {
    id: "ach",
    label: "ACH Transfer",
    sublabel: "Bank account",
    icon: <Building2 className="h-5 w-5" />,
    iconBg: "bg-blue-100 text-blue-700",
  },
];

const STRIPE_APPEARANCE = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#0f172a",
    borderRadius: "8px",
    fontSizeBase: "16px",
    spacingUnit: "5px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
};

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
  const [stripePromise, setStripePromise] = useState<Promise<StripeType | null>>(
    () => getStripe()
  );

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

  const goToConfirmation = async (paymentIntentId?: string) => {
    // Confirm payment server-side before navigating
    if (paymentIntentId && registrationId) {
      try {
        await fetch("/api/payment/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ registrationId, paymentIntentId }),
        });
      } catch {
        // Non-fatal: webhook can still handle it
      }
    }
    router.push(
      `/register/${eventId}/confirmation?registrationId=${registrationId}&code=${confirmationCode || ""}`
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
            <Button onClick={goToConfirmation} size="lg" className="mt-4">
              Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
              <div className="flex justify-between items-center">
                <span className="font-medium">Total Due</span>
                <span className="text-2xl font-bold">
                  ${(amount / 100).toFixed(2)}
                </span>
              </div>
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
          options={{ appearance: STRIPE_APPEARANCE }}
        >
          <CustomPaymentForm
            clientSecret={clientSecret}
            amount={amount}
            stripePromise={stripePromise}
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
/*  CustomPaymentForm — main methods + Stripe PaymentElement for more  */
/* ------------------------------------------------------------------ */

function CustomPaymentForm({
  clientSecret,
  amount,
  stripePromise,
  onSuccess,
  onCancel,
}: {
  clientSecret: string;
  amount: number;
  stripePromise: Promise<StripeType | null>;
  onSuccess: (paymentIntentId?: string) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [method, setMethod] = useState<MethodId>("card");
  const [processing, setProcessing] = useState(false);
  const [paymentRequest, setPaymentRequest] =
    useState<StripePaymentRequest | null>(null);
  const [walletAvailable, setWalletAvailable] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [usePaymentElement, setUsePaymentElement] = useState(false);

  // Ref for imperative PaymentElement submission
  const moreSubmitRef = useRef<(() => Promise<void>) | null>(null);

  // Card billing fields
  const [cardholderName, setCardholderName] = useState("");
  const [country, setCountry] = useState("US");
  const [zip, setZip] = useState("");

  // ACH / Check form state
  const [accountName, setAccountName] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [confirmRoutingNumber, setConfirmRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [accountType, setAccountType] = useState<"checking" | "savings">(
    "checking"
  );

  const selectedMethod = MAIN_METHODS.find((m) => m.id === method)!;

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
      // Only show native wallet button for Apple Pay / Google Pay, not Stripe Link
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
    if (!stripe) return;
    setProcessing(true);

    try {
      if (usePaymentElement) {
        // Delegate to PaymentElement's submit via ref
        if (moreSubmitRef.current) {
          await moreSubmitRef.current();
        } else {
          toast.error("Payment method is still loading. Please wait.");
        }
      } else {
        switch (method) {
          case "card":
            await handleCardPayment();
            break;
          case "check":
          case "ach":
            await handleAchPayment();
            break;
        }
      }
    } catch (err) {
      console.error("[Payment] Unexpected error:", err);
      toast.error("An unexpected error occurred. Please try again.");
    }

    setProcessing(false);
  };

  const handleCardPayment = async () => {
    if (!stripe || !elements) return;
    const cardNumber = elements.getElement(CardNumberElement);
    if (!cardNumber) return;

    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardNumber,
        billing_details: {
          name: cardholderName || undefined,
          address: {
            country: country || undefined,
            postal_code: zip || undefined,
          },
        },
      },
    });

    if (error) {
      toast.error(error.message || "Payment failed. Please try again.");
    } else {
      toast.success("Payment successful!");
      onSuccess(paymentIntent?.id);
    }
  };

  const handleAchPayment = async () => {
    if (!stripe) return;
    if (!accountName.trim()) {
      toast.error("Please enter the account holder name.");
      return;
    }
    if (routingNumber.length !== 9) {
      toast.error("Routing number must be exactly 9 digits.");
      return;
    }
    if (!accountNumber) {
      toast.error("Please enter your account number.");
      return;
    }
    if (method === "check") {
      if (routingNumber !== confirmRoutingNumber) {
        toast.error("Routing numbers do not match.");
        return;
      }
      if (accountNumber !== confirmAccountNumber) {
        toast.error("Account numbers do not match.");
        return;
      }
    }

    const { error, paymentIntent } =
      await stripe.confirmUsBankAccountPayment(clientSecret, {
        payment_method: {
          us_bank_account: {
            routing_number: routingNumber,
            account_number: accountNumber,
            account_holder_type: "individual",
          },
          billing_details: { name: accountName },
        },
      });

    if (error) {
      toast.error(error.message || "Payment failed. Please try again.");
    } else if (paymentIntent?.status === "requires_action") {
      toast.info(
        "Bank verification required. You will receive micro-deposits in 1-2 business days."
      );
      onSuccess(paymentIntent?.id);
    } else if (paymentIntent?.status === "processing") {
      toast.success(
        "Payment initiated! ACH transfers take 3-5 business days."
      );
      onSuccess(paymentIntent?.id);
    } else {
      toast.success("Payment successful!");
      onSuccess(paymentIntent?.id);
    }
  };

  /* ---- button label ---- */
  const buttonLabel = (() => {
    const amt = `$${(amount / 100).toFixed(2)}`;
    if (usePaymentElement) return `Continue to payment`;
    return `Pay ${amt}`;
  })();

  /* ---- render ---- */

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* ===== Apple Pay / Google Pay native buttons ===== */}
      {walletAvailable && paymentRequest && (
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

      {/* ===== Main Payment Methods ===== */}
      <div>
        <p className="text-sm font-medium mb-3">Choose payment method</p>
        <div className="grid grid-cols-3 gap-2">
          {MAIN_METHODS.map((m) => {
            const selected = method === m.id && !usePaymentElement;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMethod(m.id);
                  setUsePaymentElement(false);
                  setMoreOpen(false);
                }}
                className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-center transition-all ${
                  selected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-transparent bg-muted/40 hover:bg-muted/60"
                }`}
              >
                {selected && (
                  <CircleCheck className="absolute top-1.5 right-1.5 h-4 w-4 text-primary" />
                )}
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${m.iconBg}`}
                >
                  {m.icon}
                </div>
                <div>
                  <p className="text-xs font-medium leading-tight">
                    {m.label}
                  </p>
                  {m.sublabel && (
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      {m.sublabel}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== More Payment Options (Accordion → Stripe PaymentElement) ===== */}
      <div>
        <button
          type="button"
          onClick={() => {
            const opening = !moreOpen;
            setMoreOpen(opening);
            if (opening) {
              setUsePaymentElement(true);
            } else {
              setUsePaymentElement(false);
            }
          }}
          className={`flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
            usePaymentElement
              ? "border-primary bg-primary/5 text-foreground"
              : "border-input bg-muted/30 text-muted-foreground hover:bg-muted/50"
          }`}
        >
          <span>More payment options</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${
              moreOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        {moreOpen && (
          <div className="mt-3">
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: STRIPE_APPEARANCE,
              }}
            >
              <MorePaymentOptions
                submitRef={moreSubmitRef}
                returnUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/register/payment-complete`}
                onSuccess={onSuccess}
              />
            </Elements>
          </div>
        )}
      </div>

      {/* ===== Method-specific form (main methods only) ===== */}
      {!usePaymentElement && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4" />
              {method === "card" && "Card Details"}
              {(method === "check" || method === "ach") &&
                "Bank Account Details"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* ----- Credit Card ----- */}
            {method === "card" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">
                    Card information
                  </label>
                  <div className="rounded-lg border border-input overflow-hidden bg-background">
                    <div className="px-3 py-3 border-b border-input">
                      <CardNumberElement
                        options={{ showIcon: true, style: STRIPE_EL_STYLE }}
                      />
                    </div>
                    <div className="grid grid-cols-2">
                      <div className="px-3 py-3 border-r border-input">
                        <CardExpiryElement
                          options={{ style: STRIPE_EL_STYLE }}
                        />
                      </div>
                      <div className="px-3 py-3">
                        <CardCvcElement options={{ style: STRIPE_EL_STYLE }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">
                    Cardholder name
                  </label>
                  <input
                    type="text"
                    value={cardholderName}
                    onChange={(e) => setCardholderName(e.target.value)}
                    placeholder="Full name on card"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">
                    Country or region
                  </label>
                  <div className="rounded-lg border border-input overflow-hidden bg-background">
                    <select
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full px-3 py-2.5 text-base border-b border-input bg-background outline-none"
                    >
                      <option value="US">United States</option>
                      <option value="KR">South Korea</option>
                      <option value="CA">Canada</option>
                      <option value="AU">Australia</option>
                      <option value="BR">Brazil</option>
                      <option value="CN">China</option>
                      <option value="DE">Germany</option>
                      <option value="FR">France</option>
                      <option value="GB">United Kingdom</option>
                      <option value="IN">India</option>
                      <option value="JP">Japan</option>
                      <option value="MX">Mexico</option>
                      <option value="NZ">New Zealand</option>
                      <option value="PH">Philippines</option>
                      <option value="SG">Singapore</option>
                    </select>
                    <input
                      type="text"
                      value={zip}
                      onChange={(e) => setZip(e.target.value)}
                      placeholder="ZIP"
                      className="w-full px-3 py-2.5 text-base bg-background outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ----- Check (visual) ----- */}
            {method === "check" && (
              <div className="space-y-4">
                <CheckVisual
                  accountName={accountName}
                  routingNumber={routingNumber}
                  confirmRoutingNumber={confirmRoutingNumber}
                  accountNumber={accountNumber}
                  confirmAccountNumber={confirmAccountNumber}
                  accountType={accountType}
                  amount={amount}
                  onAccountNameChange={setAccountName}
                  onRoutingNumberChange={setRoutingNumber}
                  onConfirmRoutingNumberChange={setConfirmRoutingNumber}
                  onAccountNumberChange={setAccountNumber}
                  onConfirmAccountNumberChange={setConfirmAccountNumber}
                  onAccountTypeChange={setAccountType}
                />
                <AchNotice />
              </div>
            )}

            {/* ----- ACH (simple form) ----- */}
            {method === "ach" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[13px] font-medium mb-1.5">
                    Account holder name
                  </label>
                  <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="Full name on bank account"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[13px] font-medium mb-1.5">
                      Routing number
                    </label>
                    <input
                      type="text"
                      value={routingNumber}
                      onChange={(e) =>
                        setRoutingNumber(
                          e.target.value.replace(/\D/g, "").slice(0, 9)
                        )
                      }
                      placeholder="9 digits"
                      inputMode="numeric"
                      maxLength={9}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base font-mono tracking-wider outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium mb-1.5">
                      Account number
                    </label>
                    <input
                      type="text"
                      value={accountNumber}
                      onChange={(e) =>
                        setAccountNumber(
                          e.target.value.replace(/\D/g, "").slice(0, 17)
                        )
                      }
                      placeholder="Up to 17 digits"
                      inputMode="numeric"
                      maxLength={17}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base font-mono tracking-wider outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                      required
                    />
                  </div>
                </div>
                <div className="flex items-center gap-5">
                  <span className="text-[13px] font-medium">Account type:</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="achType"
                      value="checking"
                      checked={accountType === "checking"}
                      onChange={() => setAccountType("checking")}
                      className="accent-primary"
                    />
                    <span className="text-sm">Checking</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="achType"
                      value="savings"
                      checked={accountType === "savings"}
                      onChange={() => setAccountType("savings")}
                      className="accent-primary"
                    />
                    <span className="text-sm">Savings</span>
                  </label>
                </div>
                <AchNotice />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ===== Pay / Cancel ===== */}
      <Button
        type="submit"
        disabled={!stripe || processing}
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
            {usePaymentElement ? (
              <ExternalLink className="h-4 w-4 mr-2" />
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

/* ------------------------------------------------------------------ */
/*  MorePaymentOptions — Stripe PaymentElement in separate Elements    */
/* ------------------------------------------------------------------ */

function MorePaymentOptions({
  submitRef,
  returnUrl,
  onSuccess,
}: {
  submitRef: React.MutableRefObject<(() => Promise<void>) | null>;
  returnUrl: string;
  onSuccess: (paymentIntentId?: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();

  useEffect(() => {
    submitRef.current = async () => {
      if (!stripe || !elements) return;

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });

      if (error) {
        toast.error(error.message || "Payment failed.");
      } else if (
        paymentIntent?.status === "succeeded" ||
        paymentIntent?.status === "processing"
      ) {
        toast.success("Payment successful!");
        onSuccess(paymentIntent?.id);
      }
      // If redirect happened, user left the page — nothing to do here
    };

    return () => {
      submitRef.current = null;
    };
  }, [stripe, elements, submitRef, returnUrl, onSuccess]);

  return (
    <PaymentElement
      options={{
        layout: { type: "accordion", defaultCollapsed: false, radios: true },
        paymentMethodOrder: [
          "amazon_pay",
          "klarna",
        ],
        wallets: { applePay: "never", googlePay: "never" },
      }}
    />
  );
}

/* ---- Shared ACH notice ---- */

function AchNotice() {
  return (
    <>
      <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">ACH Processing Time</p>
          <p className="mt-0.5 text-amber-700">
            Bank transfers take 3-5 business days to process. Your registration
            will be confirmed once the payment clears.
          </p>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        By clicking &ldquo;Pay&rdquo;, you authorize ECKCM and Stripe, our
        payment service provider, to debit your bank account for the amount
        stated above. You may cancel this authorization at any time by
        contacting us.
      </p>
    </>
  );
}
