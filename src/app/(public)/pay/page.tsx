"use client";

import { useState } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { getStripeWithKey } from "@/lib/stripe/client";
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
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  CreditCard,
  Loader2,
  Lock,
  ShieldCheck,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";
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

type Step = "form" | "pay" | "done";

export default function CustomPaymentPage() {
  const [step, setStep] = useState<Step>("form");

  /* ---- form fields ---- */
  const [amountInput, setAmountInput] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [purpose, setPurpose] = useState("");
  const [coversFees, setCoversFees] = useState(false);

  /* ---- payment state ---- */
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [chargeAmount, setChargeAmount] = useState<number>(0);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Parse the typed dollar amount into integer cents.
  const amountCents = (() => {
    const n = parseFloat(amountInput.replace(/[^0-9.]/g, ""));
    if (!isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  })();

  const canContinue = amountCents >= 100;

  const handleContinue = async () => {
    if (amountCents < 100) {
      toast.error("Minimum amount is $1.00");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/custom-payment/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents,
          payerName: payerName.trim() || undefined,
          payerEmail: payerEmail.trim() || undefined,
          purpose: purpose.trim() || undefined,
          coversFees,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to start payment");
        setSubmitting(false);
        return;
      }
      setClientSecret(data.clientSecret);
      setPublishableKey(data.publishableKey);
      setChargeAmount(data.chargeAmount);
      setPaymentId(data.paymentId);
      setStep("pay");
    } catch {
      toast.error("Network error. Please try again.");
    }
    setSubmitting(false);
  };

  /* ---------------------------------------------------------------- */
  /*  Success screen                                                  */
  /* ---------------------------------------------------------------- */
  if (step === "done") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle className="h-14 w-14 text-green-600 mx-auto" />
            <h1 className="text-2xl font-bold">Payment Complete</h1>
            <p className="text-muted-foreground">
              Thank you. Your payment of{" "}
              <span className="font-semibold text-foreground">
                {formatCurrency(chargeAmount)}
              </span>{" "}
              was received.
            </p>
            {payerEmail && (
              <p className="text-sm text-muted-foreground">
                A receipt was sent to {payerEmail}.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Payment screen (Stripe Elements)                                */
  /* ---------------------------------------------------------------- */
  if (step === "pay" && clientSecret && publishableKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Payment</span>
                <span className="text-2xl font-bold">
                  {formatCurrency(chargeAmount)}
                </span>
              </CardTitle>
              {purpose && <CardDescription>{purpose}</CardDescription>}
            </CardHeader>
            <CardContent>
              <Elements
                stripe={getStripeWithKey(publishableKey)}
                options={{
                  clientSecret,
                  locale: "en",
                  appearance: STRIPE_APPEARANCE,
                }}
              >
                <CheckoutForm
                  paymentId={paymentId!}
                  onSuccess={() => setStep("done")}
                />
              </Elements>
            </CardContent>
          </Card>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setStep("form");
              setClientSecret(null);
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Amount entry form                                               */
  /* ---------------------------------------------------------------- */
  const feePreview = coversFees
    ? Math.ceil((amountCents + 30) / (1 - 0.029)) - amountCents
    : 0;
  const totalPreview = amountCents + feePreview;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-1">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white mx-auto">
            <CreditCard className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">Make a Payment</h1>
          <p className="text-sm text-muted-foreground">
            Enter any amount and pay securely by card.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Amount</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              {PRESET_AMOUNTS.map((cents) => (
                <Button
                  key={cents}
                  type="button"
                  variant={amountCents === cents ? "default" : "outline"}
                  onClick={() => setAmountInput((cents / 100).toString())}
                >
                  {formatCurrency(cents, { decimals: 0 })}
                </Button>
              ))}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="pl-7 text-lg"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Details</CardTitle>
            <CardDescription>Optional — helps us identify your payment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="purpose">What is this payment for?</Label>
              <Input
                id="purpose"
                placeholder="e.g. Booth fee, T-shirt, Misc."
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Your name"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">Email (for receipt)</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={payerEmail}
                  onChange={(e) => setPayerEmail(e.target.value)}
                  maxLength={255}
                />
              </div>
            </div>

            <Separator />

            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={coversFees}
                onChange={(e) => setCoversFees(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                Cover the {formatCurrency(feePreview)} card processing fee so the
                full amount goes through.
              </span>
            </label>
          </CardContent>
        </Card>

        {amountCents >= 100 && (
          <div className="rounded-lg border bg-white px-4 py-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span>{formatCurrency(amountCents)}</span>
            </div>
            {coversFees && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Processing fee</span>
                <span>{formatCurrency(feePreview)}</span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatCurrency(totalPreview)}</span>
            </div>
          </div>
        )}

        <Button
          className="w-full"
          size="lg"
          disabled={!canContinue || submitting}
          onClick={handleContinue}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Starting…
            </>
          ) : (
            <>Continue to Payment</>
          )}
        </Button>

        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          Secured by Stripe
          <ShieldCheck className="h-3 w-3 ml-1" />
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stripe checkout form (inside Elements provider)                   */
/* ------------------------------------------------------------------ */
function CheckoutForm({
  paymentId,
  onSuccess,
}: {
  paymentId: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (error) {
      toast.error(error.message || "Payment failed");
      setProcessing(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === "succeeded") {
      // Record the payment as SUCCEEDED (webhook is the backup path).
      try {
        await fetch("/api/custom-payment/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentId,
            paymentIntentId: paymentIntent.id,
          }),
        });
      } catch (err) {
        console.error("[custom-payment] confirm error:", err);
      }
      toast.success("Payment successful!");
      onSuccess();
    } else {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <Button
        type="submit"
        disabled={!stripe || processing}
        className="w-full"
        size="lg"
      >
        {processing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing…
          </>
        ) : (
          <>Pay Now</>
        )}
      </Button>
    </form>
  );
}
