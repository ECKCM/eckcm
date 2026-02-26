"use client";

import { useEffect } from "react";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { toast } from "sonner";

export function MorePaymentOptions({
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
