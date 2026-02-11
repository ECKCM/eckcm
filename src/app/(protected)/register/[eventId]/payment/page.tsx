"use client";

import { useSearchParams, useRouter, useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { StripeCheckout } from "@/components/payment/stripe-checkout";

export default function PaymentStep() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const registrationId = searchParams.get("registrationId");
  const confirmationCode = searchParams.get("code");

  if (!registrationId) {
    return (
      <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
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

  const handlePaymentSuccess = () => {
    router.push(
      `/register/${eventId}/confirmation?registrationId=${registrationId}&code=${confirmationCode || ""}`
    );
  };

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <h2 className="text-xl font-bold text-center">Complete Payment</h2>

      <StripeCheckout
        registrationId={registrationId}
        onSuccess={handlePaymentSuccess}
      />

      <p className="text-xs text-center text-muted-foreground">
        Your payment is processed securely by Stripe. We never store your card
        details.
      </p>
    </div>
  );
}
