"use client";

import { useState } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { QRCodeSVG } from "qrcode.react";
import { getStripeWithKey } from "@/lib/stripe/client";
import { useI18n } from "@/lib/i18n/context";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
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
import {
  LegalNameField,
  EmailField,
  PhoneField,
  ChurchNameField,
} from "@/components/shared/contact-fields";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  UtensilsCrossed,
  Loader2,
  Lock,
  ShieldCheck,
  CheckCircle,
  ArrowLeft,
  Minus,
  Plus,
  Clock,
  MapPin,
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

// Where buyers pick up their pre-printed meal cards (desk pickup + paid screens).
const PICKUP_LOCATION = "ECKCM Registration Booth - LLC";
const PICKUP_MAP_URL = "https://maps.app.goo.gl/P9kC8yz9vbzENJci8";

type Tier = "MEAL_GENERAL" | "MEAL_YOUTH";
// Two delivery modes:
//   DIGITAL  — pay online by Card, get the QR on screen immediately.
//   PHYSICAL — pay at the desk (Card / Zelle / Cash / Check); pick up a
//              pre-printed QR card after an admin approves the request.
type Delivery = "DIGITAL" | "PHYSICAL";
type PayMethod = "CARD" | "ZELLE" | "CASH" | "CHECK";
type Step = "form" | "pay" | "done" | "awaiting" | "paid";
type Lang = "en" | "ko";

const TIER_LABELS: Record<Tier, Record<Lang, string>> = {
  MEAL_GENERAL: { en: "General (11+)", ko: "일반 (만 11세+)" },
  MEAL_YOUTH: { en: "Youth (5–10)", ko: "청소년 (5–10세)" },
};

// Digital pays online by card. Physical pays at the desk by any of these.
const PHYSICAL_METHODS: PayMethod[] = ["CARD", "ZELLE", "CASH", "CHECK"];

const METHOD_LABELS: Record<PayMethod, Record<Lang, string>> = {
  CARD: { en: "Card", ko: "카드" },
  ZELLE: { en: "Zelle", ko: "Zelle" },
  CASH: { en: "Cash", ko: "현금" },
  CHECK: { en: "Check", ko: "수표" },
};

const DELIVERY_LABELS: Record<Delivery, Record<Lang, string>> = {
  DIGITAL: { en: "Digital Pass (single Pass)", ko: "디지털 Pass (단일 Pass)" },
  PHYSICAL: { en: "Physical Pass", ko: "실물 Pass" },
};

// All page copy in both languages, picked by the active locale.
const T = {
  unavailableTitle: { en: "Meal purchase unavailable", ko: "식사권 구매 불가" },
  unavailableBody: {
    en: "There is no active event right now. Please check back later.",
    ko: "현재 진행 중인 행사가 없습니다. 나중에 다시 확인해 주세요.",
  },
  pricingUnavailable: { en: "Meal pricing is not available.", ko: "식사 가격 정보를 불러올 수 없습니다." },
  heading: { en: "Buy Meals", ko: "식사권 구매" },
  deliveryTitle: { en: "How do you want your Pass?", ko: "Pass 수령 방식" },
  digitalDesc: {
    en: "Pay online by card — your QR appears here right away.",
    ko: "온라인 카드 결제 — QR이 바로 화면에 표시됩니다.",
  },
  physicalDesc: {
    en: "Pick up pre-printed meal cards at the desk. Pay online by card now, or at the desk by Zelle / Cash / Check.",
    ko: "인쇄된 식사 카드는 데스크에서 받습니다. 카드는 지금 온라인 결제, Zelle / 현금 / 수표는 데스크에서 결제합니다.",
  },
  paymentComplete: { en: "Payment Complete", ko: "결제 완료" },
  showAtLine: { en: "Show this code at the meal line.", ko: "식사 줄에서 이 코드를 보여주세요." },
  usableTimes: {
    en: (n: number) => `Usable ${n} time${n > 1 ? "s" : ""}.`,
    ko: (n: number) => `총 ${n}회 사용 가능합니다.`,
  },
  saveLink: {
    en: "Save this link — you can reopen your QR anytime.",
    ko: "이 링크를 저장하세요. 언제든 QR을 다시 열 수 있습니다.",
  },
  payment: { en: "Payment", ko: "결제" },
  back: { en: "Back", ko: "뒤로" },
  mealsTitle: { en: "Meals", ko: "식사" },
  mealsDesc: { en: "Choose a tier and quantity.", ko: "식사 종류와 수량을 선택하세요." },
  passesTitle: { en: "Passes", ko: "식사권" },
  passesDesc: {
    en: "Enter how many of each tier. Pick up the printed QR cards at the desk.",
    ko: "티어별로 몇 장 필요한지 입력하세요. 인쇄된 QR 카드는 데스크에서 받습니다.",
  },
  perMeal: { en: "/meal", ko: "/끼" },
  quantity: { en: "Quantity", ko: "수량" },
  mealsUnit: { en: (n: number) => `meal${n > 1 ? "s" : ""}`, ko: () => "끼" },
  yourDetails: { en: "Your Details", ko: "구매자 정보" },
  legalName: { en: "Legal Name", ko: "이름 (실명)" },
  fullNamePlaceholder: { en: "Full name", ko: "성명" },
  email: { en: "Email", ko: "이메일" },
  phone: { en: "Phone", ko: "전화번호" },
  church: { en: "Church", ko: "교회 이름" },
  optional: { en: "Optional", ko: "선택" },
  paymentMethod: { en: "Payment Method", ko: "결제 수단" },
  onsiteHint: {
    en: (m: string) =>
      `Submit your request, then pay ${m} at the registration desk. An organizer approves it, and your printed QR card is issued at the desk.`,
    ko: (m: string) =>
      `신청 후 등록 데스크에서 ${m}(으)로 결제해 주세요. 담당자가 승인하면 인쇄된 QR 카드를 데스크에서 받습니다.`,
  },
  cardPickupHint: {
    en: "Pay online by card now, then pick up your printed meal cards at the registration desk.",
    ko: "지금 카드로 온라인 결제하고, 인쇄된 식사 카드는 등록 데스크에서 받으세요.",
  },
  submitRequest: { en: "Submit Request", ko: "신청하기" },
  submitting: { en: "Submitting…", ko: "신청 중…" },
  failedSubmit: { en: "Failed to submit request", ko: "신청에 실패했습니다" },
  awaitingTitle: { en: "Request Received", ko: "신청이 접수되었습니다" },
  awaitingBody: {
    en: (m: string) =>
      `Go to the ${PICKUP_LOCATION}, pay ${m}, and pick up your printed meal cards there.`,
    ko: (m: string) =>
      `${PICKUP_LOCATION}(으)로 가서 ${m}(으)로 결제하고, 인쇄된 식사 카드를 받으세요.`,
  },
  paidTitle: { en: "Payment Received", ko: "결제가 완료되었습니다" },
  paidBody: {
    en: "Your card payment is complete. Pick up your printed meal cards at the registration desk.",
    ko: "카드 결제가 완료되었습니다. 등록 데스크에서 인쇄된 식사 카드를 받으세요.",
  },
  coverFee: {
    en: (f: string) => `Cover the ${f} card processing fee.`,
    ko: (f: string) => `카드 수수료 ${f}을(를) 부담합니다.`,
  },
  processingFee: { en: "Processing fee", ko: "처리 수수료" },
  total: { en: "Total", ko: "합계" },
  continueToPayment: { en: "Continue to Payment", ko: "결제 진행" },
  starting: { en: "Starting…", ko: "시작 중…" },
  securedByStripe: { en: "Secured by Stripe", ko: "Stripe 보안 결제" },
  payNow: { en: "Pay Now", ko: "결제하기" },
  processing: { en: "Processing…", ko: "처리 중…" },
  failedStart: { en: "Failed to start payment", ko: "결제 시작에 실패했습니다" },
  networkError: { en: "Network error. Please try again.", ko: "네트워크 오류입니다. 다시 시도해 주세요." },
  paymentSuccess: { en: "Payment successful!", ko: "결제가 완료되었습니다!" },
  paymentFailed: { en: "Payment failed", ko: "결제에 실패했습니다" },
  finalizeFail: { en: "Could not finalize meal pass", ko: "식사권 발급을 완료하지 못했습니다" },
} as const;

interface Props {
  event: { id: string; name: string; year: number | null } | null;
  prices: Record<Tier, number | null>;
}

export function MealPayClient({ event, prices }: Props) {
  const { locale } = useI18n();
  const lang: Lang = locale === "ko" ? "ko" : "en";

  const [step, setStep] = useState<Step>("form");

  /* ---- form fields ---- */
  const [tier, setTier] = useState<Tier>("MEAL_GENERAL");
  const [quantity, setQuantity] = useState(1);
  // On-site stacks tiers: separate counts for General + Youth in one request.
  const [onsiteGeneral, setOnsiteGeneral] = useState(0);
  const [onsiteYouth, setOnsiteYouth] = useState(0);
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [churchName, setChurchName] = useState("");
  // Digital (online-card) delivery is temporarily disabled — Physical only.
  const [delivery] = useState<Delivery>("PHYSICAL");
  const [method, setMethod] = useState<PayMethod>("CARD");
  const [coversFees, setCoversFees] = useState(false);

  /* ---- payment / result state ---- */
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [mealPassId, setMealPassId] = useState<string | null>(null);
  // Online-card request paid at the desk pickup (custom_payment id).
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redeemUrl, setRedeemUrl] = useState<string | null>(null);

  const unitPrice = prices[tier];
  const hasPricing = unitPrice != null && unitPrice > 0;
  // Digital (online card → on-screen QR) is temporarily disabled. The page is
  // Physical-only: a stacked General + Youth request, picked up as pre-printed
  // cards at the desk. The PAYMENT METHOD drives the flow:
  //   Card             → pay online now by Stripe, then pick up printed cards.
  //   Zelle/Cash/Check → desk request → admin approval → printed cards.
  const isDigital = delivery === "DIGITAL";
  const isCard = method === "CARD";

  // Always a stacked General + Youth request (multi-tier).
  const generalPrice = prices.MEAL_GENERAL ?? 0;
  const youthPrice = prices.MEAL_YOUTH ?? 0;
  const onsiteTotal = onsiteGeneral * generalPrice + onsiteYouth * youthPrice;
  const onsiteCount = onsiteGeneral + onsiteYouth;

  const amountCents = onsiteTotal;
  // Only the online card path can gross up the Stripe fee.
  const feePreview =
    isCard && coversFees && amountCents > 0
      ? Math.ceil((amountCents + 30) / (1 - 0.029)) - amountCents
      : 0;
  const totalPreview = amountCents + feePreview;
  // Need ≥1 pass selected with pricing.
  const canSubmit = onsiteCount >= 1 && onsiteTotal > 0;

  /* ---------------------------------------------------------------- */
  /*  No active event / pricing missing                               */
  /* ---------------------------------------------------------------- */
  if (!event) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center space-y-2">
            <div className="flex justify-end">
              <LanguageSwitcher />
            </div>
            <UtensilsCrossed className="h-12 w-12 text-muted-foreground mx-auto" />
            <h1 className="text-xl font-bold">{T.unavailableTitle[lang]}</h1>
            <p className="text-sm text-muted-foreground">
              {T.unavailableBody[lang]}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const startCardPayment = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/mealpay/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          tierCode: tier,
          quantity,
          payerName: payerName.trim() || undefined,
          payerEmail: payerEmail.trim() || undefined,
          payerPhone: payerPhone.trim() || undefined,
          churchName: churchName.trim() || undefined,
          coversFees,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || T.failedStart[lang]);
        setSubmitting(false);
        return;
      }
      // Free tier short-circuits straight to the QR.
      if (data.paid === false) {
        setRedeemUrl(data.redeemUrl);
        setStep("done");
        setSubmitting(false);
        return;
      }
      setClientSecret(data.clientSecret);
      setPublishableKey(data.publishableKey);
      setMealPassId(data.mealPassId);
      setStep("pay");
    } catch {
      toast.error(T.networkError[lang]);
    }
    setSubmitting(false);
  };

  const submitOnsite = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/mealpay/onsite-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          general: onsiteGeneral,
          youth: onsiteYouth,
          payerName: payerName.trim() || undefined,
          payerEmail: payerEmail.trim() || undefined,
          payerPhone: payerPhone.trim() || undefined,
          churchName: churchName.trim() || undefined,
          method,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || T.failedSubmit[lang]);
        setSubmitting(false);
        return;
      }
      // On-site requests need admin approval; pre-printed cards are handed out
      // at the desk. No QR appears here.
      setStep("awaiting");
    } catch {
      toast.error(T.networkError[lang]);
    }
    setSubmitting(false);
  };

  // Physical + Card: charge the combined multi-tier total online now, then pick
  // up the pre-printed cards at the desk. No on-screen QR. Confirms via the
  // shared /api/custom-payment/confirm path.
  const startOnsiteCardPayment = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/mealpay/onsite-card-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          general: onsiteGeneral,
          youth: onsiteYouth,
          payerName: payerName.trim() || undefined,
          payerEmail: payerEmail.trim() || undefined,
          payerPhone: payerPhone.trim() || undefined,
          churchName: churchName.trim() || undefined,
          coversFees,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || T.failedStart[lang]);
        setSubmitting(false);
        return;
      }
      setClientSecret(data.clientSecret);
      setPublishableKey(data.publishableKey);
      setPaymentId(data.paymentId);
      setStep("pay");
    } catch {
      toast.error(T.networkError[lang]);
    }
    setSubmitting(false);
  };

  const handleContinue = () => {
    if (!canSubmit) {
      toast.error(T.pricingUnavailable[lang]);
      return;
    }
    if (isCard) void startOnsiteCardPayment();
    else void submitOnsite();
  };

  /* ---------------------------------------------------------------- */
  /*  Awaiting-approval screen (on-site Zelle / Cash / Check)         */
  /* ---------------------------------------------------------------- */
  if (step === "awaiting") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <div className="flex justify-end">
            <LanguageSwitcher />
          </div>
          <Card>
            <CardContent className="py-10 text-center space-y-4">
              <Clock className="h-12 w-12 text-amber-500 mx-auto" />
              <h1 className="text-2xl font-bold">{T.awaitingTitle[lang]}</h1>
              <p className="text-sm text-muted-foreground">
                {[
                  onsiteGeneral > 0
                    ? `${onsiteGeneral} × ${TIER_LABELS.MEAL_GENERAL[lang]}`
                    : null,
                  onsiteYouth > 0
                    ? `${onsiteYouth} × ${TIER_LABELS.MEAL_YOUTH[lang]}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="text-sm text-muted-foreground">
                {T.awaitingBody[lang](METHOD_LABELS[method][lang])}
              </p>
              <a
                href={PICKUP_MAP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800 underline-offset-2 hover:bg-slate-200 hover:underline"
              >
                <MapPin className="h-4 w-4 shrink-0 text-slate-600" />
                <span>{PICKUP_LOCATION}</span>
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Paid screen — online card paid, pick up printed cards at desk    */
  /* ---------------------------------------------------------------- */
  if (step === "paid") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <div className="flex justify-end">
            <LanguageSwitcher />
          </div>
          <Card>
            <CardContent className="py-10 text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
              <h1 className="text-2xl font-bold">{T.paidTitle[lang]}</h1>
              <p className="text-sm text-muted-foreground">
                {[
                  onsiteGeneral > 0
                    ? `${onsiteGeneral} × ${TIER_LABELS.MEAL_GENERAL[lang]}`
                    : null,
                  onsiteYouth > 0
                    ? `${onsiteYouth} × ${TIER_LABELS.MEAL_YOUTH[lang]}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="text-sm text-muted-foreground">{T.paidBody[lang]}</p>
              <a
                href={PICKUP_MAP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800 underline-offset-2 hover:bg-slate-200 hover:underline"
              >
                <MapPin className="h-4 w-4 shrink-0 text-slate-600" />
                <span>{PICKUP_LOCATION}</span>
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Success screen — the meal QR (digital, currently disabled)      */
  /* ---------------------------------------------------------------- */
  if (step === "done" && redeemUrl) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Card>
            <CardContent className="py-8 text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
              <div>
                <h1 className="text-2xl font-bold">
                  {T.paymentComplete[lang]}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {quantity} {T.mealsUnit[lang](quantity)} · {TIER_LABELS[tier][lang]}
                </p>
              </div>

              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-lg border">
                  <QRCodeSVG
                    value={redeemUrl}
                    size={220}
                    level="H"
                    fgColor="#000000"
                    bgColor="#ffffff"
                  />
                </div>
              </div>

              <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm">
                <p className="font-semibold">{T.showAtLine[lang]}</p>
                <p className="text-muted-foreground">
                  {T.usableTimes[lang](quantity)}
                </p>
              </div>

              <a
                href={redeemUrl}
                className="block text-xs text-blue-600 underline break-all"
              >
                {redeemUrl}
              </a>
              {payerEmail && (
                <p className="text-xs text-muted-foreground">{T.saveLink[lang]}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Card payment screen (Stripe Elements)                           */
  /* ---------------------------------------------------------------- */
  if (step === "pay" && clientSecret && publishableKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{T.payment[lang]}</span>
                <span className="text-2xl font-bold">
                  {formatCurrency(totalPreview)}
                </span>
              </CardTitle>
              <CardDescription>
                {[
                  onsiteGeneral > 0
                    ? `${onsiteGeneral} × ${TIER_LABELS.MEAL_GENERAL[lang]}`
                    : null,
                  onsiteYouth > 0
                    ? `${onsiteYouth} × ${TIER_LABELS.MEAL_YOUTH[lang]}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Elements
                stripe={getStripeWithKey(publishableKey)}
                options={{
                  clientSecret,
                  locale: lang,
                  appearance: STRIPE_APPEARANCE,
                }}
              >
                <CheckoutForm
                  paymentId={paymentId!}
                  lang={lang}
                  onSuccess={() => setStep("paid")}
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
            {T.back[lang]}
          </Button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Form                                                            */
  /* ---------------------------------------------------------------- */
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex justify-end">
          <LanguageSwitcher variant="toggle" />
        </div>

        <div className="text-center space-y-1">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white mx-auto">
            <UtensilsCrossed className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">{T.heading[lang]}</h1>
          <p className="text-sm text-muted-foreground">
            {event.name}
            {event.year && !event.name.includes(String(event.year))
              ? ` ${event.year}`
              : ""}
          </p>
        </div>

        {/* Physical pass only — pre-printed cards picked up at the desk. Card
            pays online now (Stripe); Zelle / Cash / Check are paid at the desk.
            (Digital online-card delivery with on-screen QR is temporarily
            disabled.) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{T.paymentMethod[lang]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {T.physicalDesc[lang]}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {PHYSICAL_METHODS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={method === m ? "default" : "outline"}
                  onClick={() => setMethod(m)}
                >
                  {METHOD_LABELS[m][lang]}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {isCard
                ? T.cardPickupHint[lang]
                : T.onsiteHint[lang](METHOD_LABELS[method][lang])}
            </p>
          </CardContent>
        </Card>

        {/* Card payment: single tier + quantity (personal purchase) */}
        {isDigital && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{T.mealsTitle[lang]}</CardTitle>
              <CardDescription>{T.mealsDesc[lang]}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(TIER_LABELS) as Tier[]).map((t) => {
                  const p = prices[t];
                  const disabled = p == null;
                  return (
                    <Button
                      key={t}
                      type="button"
                      variant={tier === t ? "default" : "outline"}
                      disabled={disabled}
                      className="h-auto flex-col py-2"
                      onClick={() => setTier(t)}
                    >
                      <span>{TIER_LABELS[t][lang]}</span>
                      <span className="text-xs font-semibold">
                        {p != null ? `${formatCurrency(p)}${T.perMeal[lang]}` : "N/A"}
                      </span>
                    </Button>
                  );
                })}
              </div>

              <div className="space-y-1">
                <Label>{T.quantity[lang]}</Label>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    inputMode="numeric"
                    className="text-center text-lg w-20"
                    value={quantity}
                    onChange={(e) => {
                      const n = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10);
                      setQuantity(isFinite(n) ? Math.min(50, Math.max(1, n)) : 1);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity((q) => Math.min(50, q + 1))}
                    disabled={quantity >= 50}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {T.mealsUnit[lang](quantity)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Desk payment: stack General + Youth counts in one request */}
        {!isDigital && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{T.passesTitle[lang]}</CardTitle>
              <CardDescription>{T.passesDesc[lang]}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {([
                ["MEAL_GENERAL", onsiteGeneral, setOnsiteGeneral] as const,
                ["MEAL_YOUTH", onsiteYouth, setOnsiteYouth] as const,
              ]).map(([tierCode, value, setValue]) => {
                const p = prices[tierCode];
                return (
                  <div key={tierCode} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{TIER_LABELS[tierCode][lang]}</div>
                      <div className="text-xs text-muted-foreground">
                        {p != null ? `${formatCurrency(p)}${T.perMeal[lang]}` : "N/A"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setValue((q) => Math.max(0, q - 1))}
                        disabled={value <= 0 || p == null}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        inputMode="numeric"
                        className="text-center text-lg w-16"
                        value={value}
                        disabled={p == null}
                        onChange={(e) => {
                          const n = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10);
                          setValue(isFinite(n) ? Math.min(200, Math.max(0, n)) : 0);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setValue((q) => Math.min(200, q + 1))}
                        disabled={p == null}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Buyer details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{T.yourDetails[lang]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <LegalNameField
              label={T.legalName[lang]}
              placeholder={T.fullNamePlaceholder[lang]}
              value={payerName}
              onChange={setPayerName}
            />
            <EmailField
              label={T.email[lang]}
              value={payerEmail}
              onChange={setPayerEmail}
            />
            <PhoneField
              label={T.phone[lang]}
              optionalLabel={T.optional[lang]}
              value={payerPhone}
              onChange={setPayerPhone}
            />
            <ChurchNameField
              label={T.church[lang]}
              optionalLabel={T.optional[lang]}
              value={churchName}
              onChange={setChurchName}
            />
          </CardContent>
        </Card>

        {/* Card processing-fee opt-in — online card payments only. */}
        {isCard && amountCents > 0 && (
          <label className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={coversFees}
              onChange={(e) => setCoversFees(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>{T.coverFee[lang](formatCurrency(feePreview))}</span>
          </label>
        )}

        {/* Total — card shows one line; desk methods show a line per tier. */}
        {((isDigital && hasPricing) || (!isDigital && onsiteCount > 0)) && (
          <div className="rounded-lg border bg-white px-4 py-3 text-sm">
            {isDigital ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {quantity} × {TIER_LABELS[tier][lang]}
                </span>
                <span>{formatCurrency(amountCents)}</span>
              </div>
            ) : (
              <>
                {onsiteGeneral > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {onsiteGeneral} × {TIER_LABELS.MEAL_GENERAL[lang]}
                    </span>
                    <span>{formatCurrency(onsiteGeneral * generalPrice)}</span>
                  </div>
                )}
                {onsiteYouth > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {onsiteYouth} × {TIER_LABELS.MEAL_YOUTH[lang]}
                    </span>
                    <span>{formatCurrency(onsiteYouth * youthPrice)}</span>
                  </div>
                )}
              </>
            )}
            {feePreview > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{T.processingFee[lang]}</span>
                <span>{formatCurrency(feePreview)}</span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold">
              <span>{T.total[lang]}</span>
              <span>{formatCurrency(totalPreview)}</span>
            </div>
          </div>
        )}

        <Button
          className="w-full"
          size="lg"
          disabled={!canSubmit || submitting}
          onClick={handleContinue}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {isCard ? T.starting[lang] : T.submitting[lang]}
            </>
          ) : isCard ? (
            <>{T.continueToPayment[lang]}</>
          ) : (
            <>{T.submitRequest[lang]}</>
          )}
        </Button>

        {isCard && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            {T.securedByStripe[lang]}
            <ShieldCheck className="h-3 w-3 ml-1" />
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stripe checkout form (inside Elements provider)                   */
/* ------------------------------------------------------------------ */
function CheckoutForm({
  paymentId,
  lang,
  onSuccess,
}: {
  paymentId: string;
  lang: Lang;
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
      toast.error(error.message || T.paymentFailed[lang]);
      setProcessing(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === "succeeded") {
      try {
        // Flip the aggregate request PENDING → SUCCEEDED (webhook is the backup).
        const res = await fetch("/api/custom-payment/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentId,
            paymentIntentId: paymentIntent.id,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          toast.success(T.paymentSuccess[lang]);
          onSuccess();
          return;
        }
        toast.error(data.error || T.finalizeFail[lang]);
        setProcessing(false);
      } catch (err) {
        console.error("[mealpay] confirm error:", err);
        toast.error(T.finalizeFail[lang]);
        setProcessing(false);
      }
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
            {T.processing[lang]}
          </>
        ) : (
          <>{T.payNow[lang]}</>
        )}
      </Button>
    </form>
  );
}
