"use client";

import { useState, useRef } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { StripePaymentElementChangeEvent } from "@stripe/stripe-js";
import { getStripe } from "@/lib/stripe/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
  /* ---- amount input ---- */
  const [amountInput, setAmountInput] = useState("");
  const [amountCents, setAmountCents] = useState<number | null>(null);

  /* ---- donor info (optional) ---- */
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");

  /* ---- fees ---- */
  const [coversFees, setCoversFees] = useState(false);
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
      toast.error("Please enter an amount of at least $1.00");
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
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to initialize payment");
        return;
      }

      setClientSecret(data.clientSecret);
      setDonationId(data.donationId);
      setChargeAmount(data.chargeAmount);
      setFeeCents(data.feeCents);
    } catch {
      setError("Network error. Please try again.");
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
            <h2 className="text-2xl font-bold">Thank You!</h2>
            <p className="text-muted-foreground">
              Your donation of{" "}
              <span className="font-semibold text-foreground">
                ${((amountCents ?? 0) / 100).toFixed(2)}
              </span>{" "}
              has been received.
            </p>
            <p className="text-sm text-muted-foreground">
              A receipt will be sent to your email if provided.
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
                  setCoversFees(false);
                }}
                variant="outline"
              >
                Make Another Donation
              </Button>
              <Button asChild variant="ghost">
                <Link href="/">Back to Home</Link>
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
        Back to Home
      </Link>

      <div className="text-center mb-8">
        <Heart className="h-10 w-10 text-primary mx-auto mb-3" />
        <h1 className="text-3xl font-bold">Make a Donation</h1>
        <p className="mt-2 text-muted-foreground">
          Support ECKCM with a one-time donation
        </p>
      </div>

      {!clientSecret ? (
        /* ---- Step 1: Amount & Info ---- */
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Donation Amount</CardTitle>
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
                <Label htmlFor="amount">Custom Amount</Label>
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
                  Minimum $1.00, maximum $10,000.00
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
                    Cover processing fees
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Add ~3% so 100% of your donation goes to ECKCM
                  </p>
                </div>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Your Information{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  (optional)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="donorName">Name</Label>
                <Input
                  id="donorName"
                  value={donorName}
                  onChange={(e) => setDonorName(e.target.value)}
                  placeholder="Your name"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="donorEmail">Email</Label>
                <Input
                  id="donorEmail"
                  type="email"
                  value={donorEmail}
                  onChange={(e) => setDonorEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  For receipt purposes only
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
                Preparing...
              </>
            ) : (
              <>
                Continue to Payment
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
                  Secure Payment
                </span>
                <span className="text-2xl font-bold">
                  ${(chargeAmount / 100).toFixed(2)}
                </span>
              </CardTitle>
              {feeCents > 0 && (
                <p className="text-xs text-muted-foreground">
                  Includes ${(feeCents / 100).toFixed(2)} processing fee coverage
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
            Change Amount
          </Button>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Payments securely processed by Stripe</span>
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
      toast.error(error.message || "Payment failed. Please try again.");
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

    toast.success("Donation successful! Thank you!");
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
            Processing...
          </>
        ) : (
          "Donate Now"
        )}
      </Button>
    </form>
  );
}
