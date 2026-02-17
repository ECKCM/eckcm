"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter, useParams } from "next/navigation";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe/client";
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
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";

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
          // non-JSON response
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

  const goToConfirmation = () => {
    router.push(
      `/register/${eventId}/confirmation?registrationId=${registrationId}&code=${confirmationCode || ""}`
    );
  };

  // Free registration — skip payment
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
          stripe={getStripe()}
          options={{
            appearance: {
              theme: "stripe",
              variables: {
                colorPrimary: "#0f172a",
                borderRadius: "8px",
                fontSizeBase: "16px",
                spacingUnit: "5px",
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              },
              rules: {
                ".Input": {
                  borderColor: "#e2e8f0",
                  boxShadow: "none",
                  padding: "12px",
                },
                ".Input:focus": {
                  borderColor: "#0f172a",
                  boxShadow: "0 0 0 1px #0f172a",
                },
                ".Label": {
                  fontSize: "13px",
                  fontWeight: "500",
                },
              },
            },
          }}
        >
          <CustomPaymentForm
            clientSecret={clientSecret}
            amount={amount}
            onSuccess={goToConfirmation}
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
/*  Custom payment form with Card / Bank Check tabs                    */
/* ------------------------------------------------------------------ */

function CustomPaymentForm({
  clientSecret,
  amount,
  onSuccess,
}: {
  clientSecret: string;
  amount: number;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [method, setMethod] = useState<"card" | "check">("card");
  const [processing, setProcessing] = useState(false);

  // Card billing fields
  const [cardholderName, setCardholderName] = useState("");
  const [country, setCountry] = useState("US");
  const [zip, setZip] = useState("");

  // ACH (check) form state
  const [accountName, setAccountName] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState<"checking" | "savings">(
    "checking"
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe) return;
    setProcessing(true);

    try {
      if (method === "card") {
        await handleCardPayment();
      } else {
        await handleAchPayment();
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

    const { error } = await stripe.confirmCardPayment(clientSecret, {
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
      onSuccess();
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

    const { error, paymentIntent } =
      await stripe.confirmUsBankAccountPayment(clientSecret, {
        payment_method: {
          us_bank_account: {
            routing_number: routingNumber,
            account_number: accountNumber,
            account_holder_type: "individual",
          },
          billing_details: {
            name: accountName,
          },
        },
      });

    if (error) {
      toast.error(error.message || "Payment failed. Please try again.");
    } else if (paymentIntent?.status === "requires_action") {
      toast.info(
        "Bank verification required. You will receive micro-deposits in 1-2 business days."
      );
      onSuccess();
    } else if (paymentIntent?.status === "processing") {
      toast.success(
        "Payment initiated! ACH transfers take 3-5 business days to settle."
      );
      onSuccess();
    } else {
      toast.success("Payment successful!");
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Method Tabs */}
      <Card>
        <CardContent className="p-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMethod("card")}
              className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3.5 text-sm font-medium transition-all ${
                method === "card"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              <CreditCard className="h-4 w-4" />
              Credit / Debit Card
            </button>
            <button
              type="button"
              onClick={() => setMethod("check")}
              className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3.5 text-sm font-medium transition-all ${
                method === "check"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              <Landmark className="h-4 w-4" />
              Bank Check (ACH)
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Payment Method Content */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" />
            {method === "card" ? "Card Details" : "Bank Account Details"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {method === "card" ? (
            <div className="space-y-4">
              {/* Card information — grouped inputs */}
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5">
                  Card information
                </label>
                <div className="rounded-lg border border-input overflow-hidden bg-background">
                  {/* Card number */}
                  <div className="px-3 py-3 border-b border-input">
                    <CardNumberElement
                      options={{
                        showIcon: true,
                        style: {
                          base: {
                            fontSize: "16px",
                            fontFamily:
                              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            color: "#0f172a",
                            "::placeholder": { color: "#94a3b8" },
                            lineHeight: "24px",
                          },
                          invalid: { color: "#ef4444", iconColor: "#ef4444" },
                        },
                      }}
                    />
                  </div>
                  {/* Expiry + CVC */}
                  <div className="grid grid-cols-2">
                    <div className="px-3 py-3 border-r border-input">
                      <CardExpiryElement
                        options={{
                          style: {
                            base: {
                              fontSize: "16px",
                              fontFamily:
                                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                              color: "#0f172a",
                              "::placeholder": { color: "#94a3b8" },
                              lineHeight: "24px",
                            },
                            invalid: { color: "#ef4444" },
                          },
                        }}
                      />
                    </div>
                    <div className="px-3 py-3">
                      <CardCvcElement
                        options={{
                          style: {
                            base: {
                              fontSize: "16px",
                              fontFamily:
                                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                              color: "#0f172a",
                              "::placeholder": { color: "#94a3b8" },
                              lineHeight: "24px",
                            },
                            invalid: { color: "#ef4444" },
                          },
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Cardholder name */}
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

              {/* Country + ZIP — grouped */}
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5">
                  Country or region
                </label>
                <div className="rounded-lg border border-input overflow-hidden bg-background">
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full px-3 py-2.5 text-base border-b border-input bg-background outline-none focus:border-primary"
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
                    className="w-full px-3 py-2.5 text-base bg-background outline-none focus:border-primary placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <CheckVisual
                accountName={accountName}
                routingNumber={routingNumber}
                accountNumber={accountNumber}
                accountType={accountType}
                amount={amount}
                onAccountNameChange={setAccountName}
                onRoutingNumberChange={setRoutingNumber}
                onAccountNumberChange={setAccountNumber}
                onAccountTypeChange={setAccountType}
              />

              {/* ACH processing notice */}
              <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">ACH Processing Time</p>
                  <p className="mt-0.5 text-amber-700">
                    Bank transfers take 3-5 business days to process. Your
                    registration will be confirmed once the payment clears.
                  </p>
                </div>
              </div>

              {/* ACH mandate */}
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                By clicking &ldquo;Pay&rdquo;, you authorize ECKCM and Stripe,
                our payment service provider, to debit your bank account for the
                amount stated above. You may cancel this authorization at any
                time by contacting us.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit Button */}
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
            <Lock className="h-4 w-4 mr-2" />
            Pay ${(amount / 100).toFixed(2)}
          </>
        )}
      </Button>
    </form>
  );
}
