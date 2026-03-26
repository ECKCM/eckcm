"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRegistration } from "@/lib/context/registration-context";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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

export default function InstructionsStep() {
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const { state, dispatch } = useRegistration();
  const [contentEn, setContentEn] = useState("");
  const [contentKo, setContentKo] = useState("");
  const [feeCategories, setFeeCategories] = useState<FeeCategory[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!state.startDate) {
      router.push(`/register/${eventId}`);
      return;
    }

    const fetchData = async () => {
      const supabase = createClient();

      const [enRes, koRes, feesRes] = await Promise.all([
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
      ]);

      setContentEn(enRes.data?.content ?? "");
      setContentKo(koRes.data?.content ?? "");
      const fees = (feesRes.data ?? []).map((row: any) => row.eckcm_fee_categories as FeeCategory);
      setFeeCategories(fees);
      setLoading(false);
    };
    fetchData();
  }, [state.startDate, state.registrationGroupId, router, eventId]);

  if (!state.startDate || loading) {
    return null;
  }

  const handleNext = () => {
    dispatch({ type: "SET_STEP", step: 3 });
    router.push(`/register/${eventId}/participants`);
  };

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <WizardStepper currentStep={2} />

      <Card>
        <CardHeader>
          <CardTitle>Step 2: Instructions</CardTitle>
          <CardDescription>
            Please read the following information carefully before proceeding.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Fee Schedule */}
          {feeCategories.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
              <h3 className="text-sm font-semibold tracking-tight">Fee Schedule</h3>
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

          <Tabs defaultValue="en" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="en" className="flex-1">English</TabsTrigger>
              <TabsTrigger value="ko" className="flex-1">한국어</TabsTrigger>
            </TabsList>
            <TabsContent value="en">
              <MarkdownRenderer content={contentEn} />
            </TabsContent>
            <TabsContent value="ko">
              <MarkdownRenderer content={contentKo} />
            </TabsContent>
          </Tabs>

          <div className="flex items-center gap-3 rounded-lg border p-4">
            <Checkbox
              id="agree"
              checked={agreed}
              onCheckedChange={(v) => setAgreed(v === true)}
            />
            <Label htmlFor="agree" className="cursor-pointer">
              I have read and agree to the information above.
            </Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => router.push(`/register/${eventId}`)}
        >
          Back
        </Button>
        <Button onClick={handleNext} disabled={!agreed}>
          Next: Participants
        </Button>
      </div>
    </div>
  );
}
