"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Loader2, XCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

export default function PaymentCompletePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleRedirect() {
      const paymentIntentId = searchParams.get("payment_intent");
      const redirectStatus = searchParams.get("redirect_status");

      if (!paymentIntentId) {
        setError(t("payment.invalidSession"));
        return;
      }

      if (redirectStatus === "failed") {
        setError(t("payment.paymentFailed"));
        return;
      }

      // Retrieve PaymentIntent server-side to access metadata
      const res = await fetch("/api/payment/retrieve-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId }),
      });

      if (!res.ok) {
        setError(t("payment.couldNotVerify"));
        return;
      }

      const { status, registrationId, confirmationCode } = await res.json();

      if (status === "succeeded") {
        // Confirm payment server-side (generates E-Pass + sends email)
        try {
          const confirmRes = await fetch("/api/payment/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ registrationId, paymentIntentId }),
          });
          if (!confirmRes.ok) {
            const err = await confirmRes.json().catch(() => ({}));
            console.error("[payment-complete] confirm failed:", confirmRes.status, err);
          }
        } catch (err) {
          console.error("[payment-complete] confirm fetch error:", err);
        }

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
      } else if (status === "processing") {
        // Payment is still processing (e.g., bank transfer) — don't call confirm.
        // The webhook will handle it when the payment completes.
        const eventRes = await fetch(
          `/api/registration/${registrationId}/event-id`
        );
        if (eventRes.ok) {
          const { eventId } = await eventRes.json();
          router.replace(
            `/register/${eventId}/confirmation?registrationId=${registrationId}&code=${confirmationCode || ""}&processing=true`
          );
        } else {
          router.replace("/dashboard");
        }
      } else {
        setError(t("payment.paymentStatusError", { status }));
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
              <Link href="/dashboard">{t("common.goToDashboard")}</Link>
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
          <p className="text-muted-foreground">{t("payment.verifyingPayment")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
