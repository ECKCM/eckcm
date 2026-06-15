"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { Stripe as StripeType } from "@stripe/stripe-js";
import { getStripeWithKey } from "@/lib/stripe/client";
import { STRIPE_APPEARANCE } from "@/app/(protected)/register/[eventId]/payment/_components/payment-constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import Link from "next/link";
import { CheckCircle, Loader2, Lock, XCircle, CreditCard } from "lucide-react";
import { formatCurrency } from "@/lib/utils/formatters";

type Phase = "loading" | "paying" | "confirming" | "success" | "alreadyPaid" | "error";

export function PayByLinkClient({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<StripeType | null> | null>(null);
  const [amount, setAmount] = useState(0);
  const [baseCents, setBaseCents] = useState(0);
  const [coversFees, setCoversFees] = useState(false);

  const initialized = useRef(false);

  /** Load (or reload) the PaymentIntent for the given cover-fees choice. */
  const loadIntent = useCallback(
    async (covers: boolean) => {
      const res = await fetch("/api/payment/link/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, coversFees: covers }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMsg(data.error || "결제 링크를 불러오지 못했습니다.");
        setPhase("error");
        return;
      }
      if (data.alreadyPaid) {
        setPhase("alreadyPaid");
        return;
      }

      setAmount(data.amount ?? 0);
      setBaseCents(data.baseCents ?? 0);
      if (data.publishableKey) {
        setStripePromise(getStripeWithKey(data.publishableKey));
      }
      setClientSecret(data.clientSecret ?? null);
      setPhase("paying");
    },
    [token]
  );

  // On mount: either finalize a Stripe redirect, or open a fresh payment.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const url = new URL(window.location.href);
    const paymentIntentId = url.searchParams.get("payment_intent");
    const redirectStatus = url.searchParams.get("redirect_status");

    if (paymentIntentId) {
      if (redirectStatus === "failed") {
        setErrorMsg("결제가 실패했습니다. 다시 시도해 주세요.");
        setPhase("error");
        return;
      }
      setPhase("confirming");
      fetch("/api/payment/link/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, paymentIntentId }),
      })
        .then(async (res) => {
          if (res.ok) {
            setPhase("success");
          } else {
            const data = await res.json().catch(() => ({}));
            setErrorMsg(data.error || "결제 확인에 실패했습니다. 관리자에게 문의해 주세요.");
            setPhase("error");
          }
        })
        .catch(() => {
          setErrorMsg("결제 확인 중 오류가 발생했습니다.");
          setPhase("error");
        });
      return;
    }

    loadIntent(false);
  }, [token, loadIntent]);

  const handleToggleFees = (checked: boolean) => {
    setCoversFees(checked);
    setClientSecret(null);
    setPhase("loading");
    loadIntent(checked);
  };

  /* ---------- render ---------- */

  if (phase === "loading" || phase === "confirming") {
    return (
      <Shell>
        <Card>
          <CardContent className="py-12 space-y-4 text-center">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">
              {phase === "confirming" ? "결제를 확인하는 중입니다…" : "결제 정보를 불러오는 중입니다…"}
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (phase === "success") {
    return (
      <Shell>
        <Card>
          <CardContent className="py-12 space-y-4 text-center">
            <CheckCircle className="h-16 w-16 text-green-600 mx-auto" />
            <h2 className="text-xl font-semibold">결제가 완료되었습니다</h2>
            <p className="text-muted-foreground">
              등록이 확정되었습니다. 확인 이메일과 E-Pass가 발송됩니다.
            </p>
            <Button asChild>
              <Link href="/dashboard">내 등록 보기</Link>
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (phase === "alreadyPaid") {
    return (
      <Shell>
        <Card>
          <CardContent className="py-12 space-y-4 text-center">
            <CheckCircle className="h-16 w-16 text-green-600 mx-auto" />
            <h2 className="text-xl font-semibold">이미 결제 완료된 등록입니다</h2>
            <p className="text-muted-foreground">추가 결제가 필요하지 않습니다.</p>
            <Button asChild variant="outline">
              <Link href="/dashboard">내 등록 보기</Link>
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (phase === "error") {
    return (
      <Shell>
        <Card>
          <CardContent className="py-10 space-y-4 text-center">
            <XCircle className="h-14 w-14 text-destructive mx-auto" />
            <p className="text-destructive font-medium">{errorMsg}</p>
            <p className="text-sm text-muted-foreground">
              문제가 계속되면 등록 관리자에게 문의해 주세요.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // phase === "paying"
  const feeCents = coversFees ? amount - baseCents : 0;
  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5" />
            카드로 결제하기
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Order summary */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">결제 금액</span>
              <span className="font-medium">{formatCurrency(baseCents)}</span>
            </div>
            {coversFees && feeCents > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">카드 수수료</span>
                <span className="font-medium">{formatCurrency(feeCents)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between text-base">
              <span className="font-semibold">총 결제액</span>
              <span className="font-bold">{formatCurrency(amount)}</span>
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={coversFees}
              onCheckedChange={(c) => handleToggleFees(c === true)}
              className="mt-0.5"
            />
            <span className="text-muted-foreground">
              카드 처리 수수료(2.9% + $0.30)를 함께 부담합니다
            </span>
          </label>

          {clientSecret && stripePromise ? (
            <Elements
              stripe={stripePromise}
              options={{ clientSecret, appearance: STRIPE_APPEARANCE, locale: "en" }}
              key={clientSecret}
            >
              <CardForm token={token} />
            </Elements>
          ) : (
            <div className="py-6 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          )}

          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3" />
            Stripe로 안전하게 처리됩니다
          </p>
        </CardContent>
      </Card>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/*  Card form (must be a child of <Elements>)                          */
/* ------------------------------------------------------------------ */

function CardForm({ token }: { token: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        toast.error(submitError.message || "결제 정보를 확인해 주세요.");
        setProcessing(false);
        return;
      }

      const returnUrl = `${window.location.origin}/pay/${token}`;

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });

      if (error) {
        toast.error(error.message || "결제에 실패했습니다.");
        setProcessing(false);
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        // Cards don't redirect with `redirect: "if_required"`. Navigate to the
        // return URL with the PI param so the mount-time effect finalizes the
        // payment exactly once (avoids a double confirm + double email).
        window.location.replace(
          `${returnUrl}?payment_intent=${paymentIntent.id}&redirect_status=succeeded`
        );
      } else {
        setProcessing(false);
      }
    } catch {
      toast.error("예기치 못한 오류가 발생했습니다.");
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button type="submit" className="w-full" disabled={!stripe || processing}>
        {processing ? (
          <>
            <Loader2 className="size-4 animate-spin" /> 처리 중…
          </>
        ) : (
          "결제하기"
        )}
      </Button>
    </form>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md p-4 pt-12 space-y-6">{children}</div>;
}
