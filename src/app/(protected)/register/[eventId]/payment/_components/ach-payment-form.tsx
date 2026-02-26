"use client";

import { useEffect } from "react";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

export function AchPaymentForm({
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
        toast.success(
          paymentIntent.status === "processing"
            ? "Payment initiated! ACH transfers take 3-5 business days."
            : "Payment successful!"
        );
        onSuccess(paymentIntent?.id);
      }
    };

    return () => {
      submitRef.current = null;
    };
  }, [stripe, elements, submitRef, returnUrl, onSuccess]);

  return (
    <PaymentElement
      options={{
        layout: { type: "accordion", defaultCollapsed: false, radios: false },
        paymentMethodOrder: ["us_bank_account"],
        wallets: { applePay: "never", googlePay: "never" },
      }}
    />
  );
}

export function AchNotice() {
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
