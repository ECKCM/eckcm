"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRegistration } from "@/lib/context/registration-context";
import { useI18n } from "@/lib/i18n/context";
import { WizardStepper } from "@/components/registration/wizard-stepper";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function KeyDepositStep() {
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const { state, dispatch } = useRegistration();
  const { t } = useI18n();

  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!state.startDate) {
      router.push(`/register/${eventId}`);
      return;
    }

    const checkKeyDeposit = async () => {
      if (!state.registrationGroupId) return;
      const supabase = createClient();
      const { data } = await supabase
        .from("eckcm_registration_groups")
        .select("show_key_deposit")
        .eq("id", state.registrationGroupId)
        .single();
      if (data?.show_key_deposit === false) {
        router.push(`/register/${eventId}/airport-pickup`);
      } else {
        setAllowed(true);
      }
    };
    checkKeyDeposit();
  }, [state.startDate, state.registrationGroupId, router, eventId]);

  if (!state.startDate || allowed !== true) {
    return null;
  }

  const updateKeyCount = (groupIndex: number, count: number) => {
    const group = { ...state.roomGroups[groupIndex] };
    group.keyCount = count;
    dispatch({ type: "UPDATE_ROOM_GROUP", index: groupIndex, group });
  };

  const handleNext = () => {
    dispatch({ type: "SET_STEP", step: 6 });
    router.push(`/register/${eventId}/airport-pickup`);
  };

  const totalKeys = state.roomGroups.reduce((sum, g) => sum + g.keyCount, 0);

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <WizardStepper currentStep={5} />

      <Card>
        <CardHeader>
          <CardTitle>{t("registration.step5Title")}</CardTitle>
          <CardDescription>
            {t("registration.step5Desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.roomGroups.map((group, gi) => (
            <div
              key={group.id}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <div>
                <p className="font-medium">{state.roomGroups.length > 1 ? t("registration.roomGroupNum", { number: gi + 1 }) : t("registration.roomGroup")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("registration.nParticipants", { count: group.participants.length })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Label>{t("registration.keysLabel")}</Label>
                <Select
                  value={group.keyCount.toString()}
                  onValueChange={(v) => updateKeyCount(gi, parseInt(v))}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
          <p className="text-sm text-muted-foreground">
            {t("registration.totalKeysDeposit", { keys: totalKeys, amount: (totalKeys * 65).toFixed(2) })}
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => router.push(`/register/${eventId}/lodging`)}
        >
          {t("common.back")}
        </Button>
        <Button onClick={handleNext}>{t("registration.nextAirportPickup")}</Button>
      </div>
    </div>
  );
}
