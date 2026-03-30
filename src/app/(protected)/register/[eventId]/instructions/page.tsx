"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRegistration } from "@/lib/context/registration-context";
import { useI18n } from "@/lib/i18n/context";
import { WizardStepper } from "@/components/registration/wizard-stepper";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { Sparkles, X } from "lucide-react";
import Image from "next/image";

interface FeeCategory {
  code: string;
  name_en: string;
  pricing_type: string;
  amount_cents: number;
}

const FEE_GROUPS: { title: string; codes: string[] }[] = [
  { title: "Registration", codes: ["REG_FEE", "EARLY_BIRD"] },
  { title: "Lodging", codes: ["LODGING_AC", "LODGING_NON_AC", "LODGING_EXTRA", "KEY_DEPOSIT"] },
  { title: "Meals", codes: ["MEAL_GENERAL_FULLDAY", "MEAL_GENERAL", "MEAL_YOUTH_FULLDAY", "MEAL_YOUTH"] },
  { title: "Other Fees", codes: ["VBS_MATERIALS"] },
];

function formatFeeAmount(fee: FeeCategory): string {
  const isDiscount = fee.code.includes("DISCOUNT");
  const dollars = `$${(fee.amount_cents / 100).toFixed(fee.amount_cents % 100 === 0 ? 0 : 2)}`;
  const prefix = isDiscount ? "-" : "";
  const suffix = isDiscount ? " / person" : "";
  switch (fee.pricing_type) {
    case "PER_NIGHT":
      return `${prefix}${dollars} / night`;
    case "PER_MEAL":
      return `${prefix}${dollars} / meal`;
    default:
      return `${prefix}${dollars}${suffix}`;
  }
}

/* ── AI Summary typing animation ── */

type AiProvider = "claude" | "chatgpt";
type AiState = "idle" | "typing" | "showing";

function useTypingAnimation(text: string, durationMs = 3000) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const rafRef = useRef<number>(0);

  const start = useCallback(() => {
    setDisplayed("");
    setDone(false);
    const chars = [...text];
    const total = chars.length;
    if (total === 0) { setDone(true); return; }
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const idx = Math.floor(progress * total);
      setDisplayed(chars.slice(0, idx).join(""));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayed(text);
        setDone(true);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [text, durationMs]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return { displayed, done, start };
}

const AI_LOGOS: Record<AiProvider, { label: string; bg: string; icon: React.ReactNode }> = {
  claude: {
    label: "Claude",
    bg: "bg-[#D97757]/10 hover:bg-[#D97757]/20 border-[#D97757]/30",
    icon: <Image src="/images/claude-color.svg" alt="Claude" width={16} height={16} className="size-4" />,
  },
  chatgpt: {
    label: "ChatGPT",
    bg: "bg-[#10A37F]/10 hover:bg-[#10A37F]/20 border-[#10A37F]/30",
    icon: <Image src="/images/openai.svg" alt="ChatGPT" width={16} height={16} className="size-4" />,
  },
};

export default function InstructionsStep() {
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const { state, dispatch } = useRegistration();
  const { locale, t } = useI18n();

  const [contentEn, setContentEn] = useState("");
  const [contentKo, setContentKo] = useState("");
  const [feeCategories, setFeeCategories] = useState<FeeCategory[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(true);

  // AI Summary state
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [aiProvider, setAiProvider] = useState<AiProvider | null>(null);
  const [aiState, setAiState] = useState<AiState>("idle");

  const summaryKey = aiProvider ? `${aiProvider}-summary-${locale}` : "";
  const summaryText = summaryKey ? summaries[summaryKey] ?? "" : "";

  const typing = useTypingAnimation(summaryText, 7000);

  useEffect(() => {
    if (!state.startDate) {
      router.push(`/register/${eventId}`);
      return;
    }

    const fetchData = async () => {
      const supabase = createClient();

      const [enRes, koRes, feesRes, claudeEnRes, claudeKoRes, chatgptEnRes, chatgptKoRes] =
        await Promise.all([
          supabase
            .from("eckcm_legal_content")
            .select("content")
            .eq("slug", "registration-instructions-en")
            .single(),
          supabase
            .from("eckcm_legal_content")
            .select("content")
            .eq("slug", "registration-instructions-ko")
            .single(),
          state.registrationGroupId
            ? supabase
                .from("eckcm_registration_group_fee_categories")
                .select("eckcm_fee_categories!inner(code, name_en, pricing_type, amount_cents, is_active)")
                .eq("registration_group_id", state.registrationGroupId)
                .eq("eckcm_fee_categories.is_active", true)
            : Promise.resolve({ data: null }),
          supabase.from("eckcm_legal_content").select("content").eq("slug", "claude-summary-en").single(),
          supabase.from("eckcm_legal_content").select("content").eq("slug", "claude-summary-ko").single(),
          supabase.from("eckcm_legal_content").select("content").eq("slug", "chatgpt-summary-en").single(),
          supabase.from("eckcm_legal_content").select("content").eq("slug", "chatgpt-summary-ko").single(),
        ]);

      setContentEn(enRes.data?.content ?? "");
      setContentKo(koRes.data?.content ?? "");
      const fees = (feesRes.data ?? []).map((row: any) => row.eckcm_fee_categories as FeeCategory);
      setFeeCategories(fees);
      setSummaries({
        "claude-summary-en": claudeEnRes.data?.content ?? "",
        "claude-summary-ko": claudeKoRes.data?.content ?? "",
        "chatgpt-summary-en": chatgptEnRes.data?.content ?? "",
        "chatgpt-summary-ko": chatgptKoRes.data?.content ?? "",
      });
      setLoading(false);
    };
    fetchData();
  }, [state.startDate, state.registrationGroupId, router, eventId]);

  // When provider or locale changes while showing, reset
  useEffect(() => {
    if (aiState === "showing") {
      setAiState("idle");
      setAiProvider(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const handleAiClick = (provider: AiProvider) => {
    if (aiProvider === provider && aiState !== "idle") {
      // Close if same provider clicked again
      setAiState("idle");
      setAiProvider(null);
      return;
    }
    setAiProvider(provider);
    setAiState("typing");
  };

  // Start typing animation when state transitions to "typing"
  useEffect(() => {
    if (aiState === "typing" && summaryText) {
      typing.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiState, summaryText]);

  // Transition from typing to showing when done
  useEffect(() => {
    if (aiState === "typing" && typing.done) {
      setAiState("showing");
    }
  }, [aiState, typing.done]);

  if (!state.startDate || loading) {
    return null;
  }

  const instructionContent = locale === "ko" ? contentKo : contentEn;

  const handleNext = () => {
    dispatch({ type: "SET_STEP", step: 3 });
    router.push(`/register/${eventId}/participants`);
  };

  const handleCloseAi = () => {
    setAiState("idle");
    setAiProvider(null);
  };

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <WizardStepper currentStep={2} />

      <Card>
        <CardHeader>
          <CardTitle>{t("registration.step2Title")}</CardTitle>
          <CardDescription>
            {t("registration.step2Desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Fee Schedule */}
          {feeCategories.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
              <h3 className="text-sm font-semibold tracking-tight">{t("registration.feeSchedule")}</h3>
              {FEE_GROUPS.map((group) => {
                const items = group.codes
                  .map((code) => feeCategories.find((f) => f.code === code))
                  .filter((f): f is FeeCategory => f != null && f.amount_cents > 0);
                if (items.length === 0) return null;
                return (
                  <div key={group.title}>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">{group.title}</p>
                    <div className="space-y-1">
                      {items.map((fee) => (
                        <div key={fee.code} className="flex items-baseline gap-1 text-sm">
                          <span className="min-w-0">{fee.name_en}</span>
                          <span className="flex-1 shrink-0 min-w-4 border-b border-dotted border-muted-foreground/30 translate-y-[-3px]" />
                          <span className="shrink-0 font-medium tabular-nums whitespace-nowrap">{formatFeeAmount(fee)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* AI Summary */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("registration.aiSummary")}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("registration.aiSummaryDesc")}</p>

            <div className="flex gap-2">
              {(Object.keys(AI_LOGOS) as AiProvider[]).map((provider) => {
                const cfg = AI_LOGOS[provider];
                const isActive = aiProvider === provider && aiState !== "idle";
                return (
                  <button
                    key={provider}
                    onClick={() => handleAiClick(provider)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      isActive
                        ? cfg.bg + " ring-1 ring-offset-1 ring-current"
                        : cfg.bg
                    }`}
                  >
                    {cfg.icon}
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            {/* AI Summary content area */}
            {aiProvider && aiState !== "idle" && (
              <div className="rounded-lg border bg-muted/20 p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {AI_LOGOS[aiProvider].icon}
                    <span className="text-sm font-medium">{AI_LOGOS[aiProvider].label}</span>
                    {aiState === "typing" && (
                      <span className="inline-flex gap-0.5">
                        <span className="size-1 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                        <span className="size-1 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                        <span className="size-1 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleCloseAi}
                    className="rounded-full p-1 hover:bg-muted transition-colors"
                    aria-label={t("registration.aiSummaryClose")}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>

                {/* Fake typing prompt */}
                {aiState === "typing" && (
                  <div className="text-xs text-muted-foreground italic border-l-2 border-muted-foreground/30 pl-3">
                    {t("registration.aiTypingPrompt")}
                  </div>
                )}

                {/* Summary content with typing effect */}
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                  <MarkdownRenderer content={aiState === "typing" ? typing.displayed : summaryText} />
                  {aiState === "typing" && (
                    <span className="inline-block w-0.5 h-4 bg-current animate-pulse ml-0.5 align-text-bottom" />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Registration instructions — auto-selected by locale */}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MarkdownRenderer content={instructionContent} />
          </div>

          <div className="flex items-center gap-3 rounded-lg border p-4">
            <Checkbox
              id="agree"
              checked={agreed}
              onCheckedChange={(v) => setAgreed(v === true)}
            />
            <Label htmlFor="agree" className="cursor-pointer">
              {t("registration.agreeInfo")}
            </Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => router.push(`/register/${eventId}`)}
        >
          {t("common.back")}
        </Button>
        <Button onClick={handleNext} disabled={!agreed}>
          {t("registration.nextParticipantsBtn")}
        </Button>
      </div>
    </div>
  );
}
