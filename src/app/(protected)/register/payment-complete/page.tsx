"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
      const paymentIntentId = searchParams.get("payment_intent");
      const redirectStatus = searchParams.get("redirect_status");

      if (!paymentIntentId) {
        setError("Invalid payment session.");
        return;
      }

      if (redirectStatus === "failed") {
        setError("Payment failed. Please try again.");
        return;
      }

      // Retrieve PaymentIntent server-side to access metadata
      const res = await fetch("/api/payment/retrieve-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId }),
      });

      if (!res.ok) {
        setError("Could not verify payment.");
        return;
      }

      const { status, registrationId, confirmationCode } = await res.json();

      if (status === "succeeded" || status === "processing") {
        // Find the eventId from the registration
        const eventRes = await fetch(
          `/api/registration/${registrationId}/event-id`
        );
        if (eventRes.ok) {
          const { eventId } = await eventRes.json();
          router.replace(
            `/register/${eventId}/confirmation?registrationId=${registrationId}&code=${confirmationCode || ""}`
          );
        } else {
          router.replace("/dashboard");
        }
      } else {
        setError(`Payment status: ${status}. Please try again.`);
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
