"use client";

import { QRCodeSVG } from "qrcode.react";
import { useI18n } from "@/lib/i18n/context";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UtensilsCrossed, CheckCircle, XCircle, Clock } from "lucide-react";

type Lang = "en" | "ko";

const TIER_LABEL: Record<string, Record<Lang, string>> = {
  MEAL_GENERAL: { en: "General", ko: "일반" },
  MEAL_YOUTH: { en: "Youth", ko: "청소년" },
};

const T = {
  heading: { en: "Meal Pass", ko: "식사권" },
  leftOf: {
    en: (r: number, t: number) => `${r} of ${t} left`,
    ko: (r: number, t: number) => `${t}회 중 ${r}회 남음`,
  },
  showAtLine: { en: "Show this code at the meal line.", ko: "식사 줄에서 이 코드를 보여주세요." },
  awaitingTitle: { en: "Awaiting approval", ko: "승인 대기 중" },
  awaitingBody: {
    en: "An organizer will approve this on-site payment. Your QR code appears here once approved.",
    ko: "담당자가 현장 결제를 승인하면 이 화면에 QR 코드가 표시됩니다.",
  },
  incompleteTitle: { en: "Payment incomplete", ko: "결제 미완료" },
  incompleteBody: {
    en: "This meal pass is not active yet.",
    ko: "이 식사권은 아직 활성화되지 않았습니다.",
  },
  fullyUsed: { en: "Fully used", ko: "모두 사용됨" },
  notAvailable: { en: "Not available", ko: "사용 불가" },
  fullyUsedBody: {
    en: "All meals on this pass have been used.",
    ko: "이 식사권의 모든 식사를 사용했습니다.",
  },
  notAvailableBody: {
    en: "This meal pass is no longer valid.",
    ko: "이 식사권은 더 이상 유효하지 않습니다.",
  },
} as const;

interface Props {
  redeemUrl: string;
  status: string;
  usesTotal: number;
  usesRemaining: number;
  tierCode: string | null;
  payerName: string | null;
}

export function MealPassViewer({
  redeemUrl,
  status,
  usesTotal,
  usesRemaining,
  tierCode,
  payerName,
}: Props) {
  const { locale } = useI18n();
  const lang: Lang = locale === "ko" ? "ko" : "en";

  // Only an ACTIVE pass shows its QR. SUBMITTED = on-site payment awaiting admin
  // approval (no QR yet); PENDING = card payment not completed.
  const servable = status === "ACTIVE" && usesRemaining > 0;
  const awaitingApproval = status === "SUBMITTED";
  const pendingPayment = status === "PENDING";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex justify-end">
          <LanguageSwitcher />
        </div>

        <div className="text-center space-y-1">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white mx-auto">
            <UtensilsCrossed className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">{T.heading[lang]}</h1>
          {payerName && (
            <p className="text-sm text-muted-foreground">{payerName}</p>
          )}
        </div>

        <Card>
          <CardContent className="py-8 text-center space-y-4">
            {servable ? (
              <>
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
                <div className="flex items-center justify-center gap-2">
                  <Badge variant="secondary">
                    {T.leftOf[lang](usesRemaining, usesTotal)}
                  </Badge>
                  {tierCode && TIER_LABEL[tierCode] && (
                    <Badge variant="outline">{TIER_LABEL[tierCode][lang]}</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {T.showAtLine[lang]}
                </p>
              </>
            ) : awaitingApproval ? (
              <>
                <Clock className="h-12 w-12 text-amber-500 mx-auto" />
                <h2 className="text-lg font-bold">{T.awaitingTitle[lang]}</h2>
                <p className="text-sm text-muted-foreground">
                  {T.awaitingBody[lang]}
                </p>
              </>
            ) : pendingPayment ? (
              <>
                <XCircle className="h-12 w-12 text-amber-500 mx-auto" />
                <h2 className="text-lg font-bold">{T.incompleteTitle[lang]}</h2>
                <p className="text-sm text-muted-foreground">
                  {T.incompleteBody[lang]}
                </p>
              </>
            ) : (
              <>
                {usesRemaining <= 0 ? (
                  <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto" />
                ) : (
                  <XCircle className="h-12 w-12 text-muted-foreground mx-auto" />
                )}
                <h2 className="text-lg font-bold">
                  {usesRemaining <= 0 ? T.fullyUsed[lang] : T.notAvailable[lang]}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {usesRemaining <= 0
                    ? T.fullyUsedBody[lang]
                    : T.notAvailableBody[lang]}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
