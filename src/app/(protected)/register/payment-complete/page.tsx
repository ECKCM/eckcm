"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getStripe } from "@/lib/stripe/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Loader2, XCircle } from "lucide-react";

export default function PaymentCompletePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleRedirect() {
      const clientSecret = searchParams.get("payment_intent_client_secret");
      const redirectStatus = searchParams.get("redirect_status");

      if (!clientSecret) {
        setError("Invalid payment session.");
        return;
      }

      if (redirectStatus === "failed") {
        setError("Payment failed. Please try again.");
        return;
      }

      // Retrieve the PaymentIntent to get metadata
      const stripe = await getStripe();
      if (!stripe) {
        setError("Failed to load payment system.");
        return;
      }

      const { paymentIntent, error: retrieveError } =
        await stripe.retrievePaymentIntent(clientSecret);

      if (retrieveError || !paymentIntent) {
        setError(retrieveError?.message || "Could not verify payment.");
        return;
      }

      if (
        paymentIntent.status === "succeeded" ||
        paymentIntent.status === "processing"
      ) {
        // Stripe.js PaymentIntent doesn't type metadata, but it's present at runtime
        const metadata = (paymentIntent as unknown as { metadata: Record<string, string> }).metadata;
        const { registrationId, confirmationCode } = metadata;
        // Find the eventId from the registration via API
        const res = await fetch(
          `/api/registration/${registrationId}/event-id`
        );
        if (res.ok) {
          const { eventId } = await res.json();
          router.replace(
            `/register/${eventId}/confirmation?registrationId=${registrationId}&code=${confirmationCode || ""}`
          );
        } else {
          // Fallback: go to dashboard
          router.replace("/dashboard");
        }
      } else {
        setError(`Payment status: ${paymentIntent.status}. Please try again.`);
      }
    }

    handleRedirect();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="mx-auto max-w-md p-4 pt-16 space-y-6 text-center">
        <XCircle className="h-16 w-16 text-destructive mx-auto" />
        <Card>
          <CardContent className="py-8 space-y-4">
            <p className="text-destructive font-medium">{error}</p>
            <Button asChild>
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-4 pt-16 space-y-6 text-center">
      <Card>
        <CardContent className="py-12 space-y-4">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Verifying payment...</p>
        </CardContent>
      </Card>
    </div>
  );
}
