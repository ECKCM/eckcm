"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRegistration } from "@/lib/context/registration-context";
import { WizardStepper } from "@/components/registration/wizard-stepper";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { calculateAge } from "@/lib/utils/validators";
import { INFANT_AGE_THRESHOLD } from "@/lib/utils/constants";
import { useI18n } from "@/lib/i18n/context";

interface LodgingOption {
  code: string;
  name_en: string;
  pricing_type: string;
  amount_cents: number;
  min_nights: number | null;
  metadata: Record<string, unknown> | null;
}

export default function LodgingStep() {
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const { state, dispatch } = useRegistration();
  const { locale, t } = useI18n();
  const [lodgingOptions, setLodgingOptions] = useState<LodgingOption[]>([]);
  const [hasExtraFee, setHasExtraFee] = useState(false);
  const [extraFeeAmount, setExtraFeeAmount] = useState(0);
  const [showSpecialPreferences, setShowSpecialPreferences] = useState(true);
  const [showKeyDeposit, setShowKeyDeposit] = useState(true);
  // Per-group agreement consent: keyed by room group index
  const [agreedMap, setAgreedMap] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [inventoryMap, setInventoryMap] = useState<
    Record<string, { available: number; is_force_stopped: boolean }>
  >({});

  useEffect(() => {
    if (!state.startDate) {
      router.push(`/register/${eventId}`);
      return;
    }

    const fetchLodgingOptions = async () => {
      const supabase = createClient();

      // Fetch group settings for toggles
      const { data: groupData } = await supabase
        .from("eckcm_registration_groups")
        .select("show_special_preferences, show_key_deposit")
        .eq("id", state.registrationGroupId!)
        .single();
      setShowSpecialPreferences(groupData?.show_special_preferences ?? true);
      setShowKeyDeposit(groupData?.show_key_deposit ?? true);

      const { data, error } = await supabase
        .from("eckcm_registration_group_fee_categories")
        .select("eckcm_fee_categories!inner(code, name_en, pricing_type, amount_cents, min_nights, is_active, metadata)")
        .eq("registration_group_id", state.registrationGroupId!)
        .like("eckcm_fee_categories.code", "LODGING_%")
        .eq("eckcm_fee_categories.is_active", true);

      if (error) {
        console.error("Failed to fetch lodging options:", error);
        setLoading(false);
        return;
      }

      const all = (data ?? []).map((row: any) => row.eckcm_fee_categories as LodgingOption);

      // Separate selectable options from LODGING_EXTRA, filter by min_nights
      const selectable = all.filter(
        (o) => o.code !== "LODGING_EXTRA" && (o.min_nights == null || state.nightsCount >= o.min_nights)
      );
      const extra = all.find((o) => o.code === "LODGING_EXTRA");

      setLodgingOptions(selectable);
      setHasExtraFee(!!extra);
      setExtraFeeAmount(extra?.amount_cents ?? 0);

      // Fetch inventory availability for lodging options
      const lodgingCodes = selectable.map((o) => o.code);
      const invMap: Record<string, { available: number; is_force_stopped: boolean }> = {};
      if (lodgingCodes.length > 0) {
        const { data: inventoryData } = await supabase
          .from("eckcm_fee_category_inventory")
          .select(
            "total_quantity, held, reserved, is_force_stopped, eckcm_fee_categories!inner(code)"
          )
          .in("eckcm_fee_categories.code", lodgingCodes);

        for (const row of (inventoryData ?? []) as any[]) {
          const code = row.eckcm_fee_categories.code;
          invMap[code] = {
            available: row.total_quantity - row.held - row.reserved,
            is_force_stopped: row.is_force_stopped ?? false,
          };
        }
      }
      setInventoryMap(invMap);

      // Auto-select first available option as default if rooms exist
      if (selectable.length >= 1) {
        state.roomGroups.forEach((group, gi) => {
          if (!group.lodgingType) {
            const firstAvailable = selectable.find((o) => {
              const inv = invMap[o.code];
              return !inv || (inv.available > 0 && !inv.is_force_stopped);
            });
            if (firstAvailable) {
              const updated = { ...group, lodgingType: firstAvailable.code };
              dispatch({ type: "UPDATE_ROOM_GROUP", index: gi, group: updated });
            }
          }
        });
      }

      setLoading(false);
    };

    if (state.registrationGroupId) {
      fetchLodgingOptions();
    }
  }, [state.startDate, state.registrationGroupId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state.startDate || loading) {
    return null;
  }

  const selectLodging = (groupIndex: number, code: string) => {
    const group = { ...state.roomGroups[groupIndex], lodgingType: code };
    dispatch({ type: "UPDATE_ROOM_GROUP", index: groupIndex, group });
    // Reset agreement consent when switching lodging type
    setAgreedMap((prev) => ({ ...prev, [groupIndex]: false }));
  };

  const updatePreference = (
    groupIndex: number,
    key: "elderly" | "handicapped" | "firstFloor",
    value: boolean
  ) => {
    const group = { ...state.roomGroups[groupIndex] };
    group.preferences = { ...group.preferences, [key]: value };
    dispatch({ type: "UPDATE_ROOM_GROUP", index: groupIndex, group });
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(0)}`;
  };

  // Helper: get agreement content for a lodging code
  const getAgreement = (code: string | undefined): string | null => {
    if (!code) return null;
    const option = lodgingOptions.find((o) => o.code === code);
    if (!option?.metadata?.show_agreement) return null;
    const text = locale === "ko"
      ? (option.metadata.agreement_ko as string)
      : (option.metadata.agreement_en as string);
    return text || null;
  };

  // Check if all room groups with agreements have been agreed to
  const allAgreementsAccepted = state.roomGroups.every((group, gi) => {
    const agreement = getAgreement(group.lodgingType);
    return !agreement || agreedMap[gi];
  });

  const handleNext = () => {
    // Validate: each room group must have a lodging type selected
    for (let i = 0; i < state.roomGroups.length; i++) {
      if (!state.roomGroups[i].lodgingType) {
        toast.error(t("registration.selectRoomType", { group: state.roomGroups.length > 1 ? ` ${i + 1}` : "" }));
        return;
      }
    }

    // Validate: lodging agreements must be accepted
    if (!allAgreementsAccepted) {
      toast.error(t("registration.lodgingAgreementRequired"));
      return;
    }

    if (showKeyDeposit) {
      dispatch({ type: "SET_STEP", step: 5 });
      router.push(`/register/${eventId}/key-deposit`);
    } else {
      dispatch({ type: "SET_STEP", step: 6 });
      router.push(`/register/${eventId}/airport-pickup`);
    }
  };

  const isSingleOption = lodgingOptions.length === 1;

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <WizardStepper currentStep={4} />

      <Card>
        <CardHeader>
          <CardTitle>{t("registration.step4Title")}</CardTitle>
          <CardDescription>
            {isSingleOption
              ? t("registration.step4DescSingle")
              : t("registration.step4Desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {state.roomGroups.map((group, gi) => (
            <div key={group.id} className="space-y-4 rounded-lg border p-4">
              <h3 className="font-medium">
                {state.roomGroups.length > 1 ? t("registration.roomGroupNum", { number: gi + 1 }) : t("registration.roomGroup")} ({t("registration.nPeople", { count: group.participants.length })})
              </h3>

              {/* Lodging Type Selection */}
              {isSingleOption && (() => {
                const inv = inventoryMap[lodgingOptions[0].code];
                const singleSoldOut = inv ? (inv.available <= 0 || inv.is_force_stopped) : false;
                return singleSoldOut;
              })() ? (
                // Single option but sold out / force-stopped
                <div className="rounded-lg border-2 border-destructive/50 bg-destructive/5 p-4 text-center">
                  <p className="font-medium text-destructive">{t("registration.lodgingUnavailable")}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t("registration.contactOrganizer")}</p>
                </div>
              ) : isSingleOption ? (
                // Single option — auto-selected, show info card
                <div className="rounded-lg border-2 border-primary bg-primary/5 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{lodgingOptions[0].name_en}</p>
                      <p className="text-sm text-muted-foreground">
                        {lodgingOptions[0].amount_cents === 0
                          ? t("registration.included")
                          : lodgingOptions[0].pricing_type === "PER_NIGHT"
                            ? t("registration.perNight", { price: formatPrice(lodgingOptions[0].amount_cents) })
                            : formatPrice(lodgingOptions[0].amount_cents)}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-primary">{t("registration.assigned")}</span>
                  </div>
                </div>
              ) : (
                // Multiple options — choice cards
                <div className="grid gap-3">
                  {lodgingOptions.map((option) => {
                    const isSelected = group.lodgingType === option.code;
                    const totalEstimate =
                      option.pricing_type === "PER_NIGHT"
                        ? option.amount_cents * state.nightsCount
                        : option.amount_cents;
                    const inv = inventoryMap[option.code];
                    const isSoldOut = inv
                      ? inv.available <= 0 || inv.is_force_stopped
                      : false;
                    const spotsLeft = inv?.available ?? null;

                    return (
                      <button
                        key={option.code}
                        type="button"
                        onClick={() => !isSoldOut && selectLodging(gi, option.code)}
                        disabled={isSoldOut}
                        className={`w-full rounded-lg border-2 p-4 text-left transition-colors ${
                          isSoldOut
                            ? "opacity-50 cursor-not-allowed border-muted bg-muted/30"
                            : isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{option.name_en}</p>
                            <p className="text-sm text-muted-foreground">
                              {option.pricing_type === "PER_NIGHT"
                                ? t("registration.perNight", { price: formatPrice(option.amount_cents) })
                                : formatPrice(option.amount_cents)}
                            </p>
                          </div>
                          <div className="text-right">
                            {isSoldOut ? (
                              <span className="inline-block rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                                {t("registration.soldOut")}
                              </span>
                            ) : (
                              <>
                                <p className="font-semibold">
                                  {formatPrice(totalEstimate)}
                                </p>
                                {option.pricing_type === "PER_NIGHT" && (
                                  <p className="text-xs text-muted-foreground">
                                    {t("registration.nightCount", { count: state.nightsCount, s: state.nightsCount !== 1 ? "s" : "" })}
                                  </p>
                                )}
                                {spotsLeft !== null && spotsLeft <= 5 && spotsLeft > 0 && (
                                  <p className="text-xs font-medium text-orange-600 mt-0.5">
                                    {t("registration.spotsLeft", { count: spotsLeft })}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* LODGING_EXTRA notice for 3+ billable people (infants exempt) */}
              {(() => {
                if (!hasExtraFee) return null;
                const refDate = new Date(state.startDate + "T00:00:00");
                const billable = group.participants.filter((p) => {
                  const bd = new Date(
                    p.birthYear ?? 2000,
                    (p.birthMonth ?? 1) - 1,
                    p.birthDay ?? 1
                  );
                  return calculateAge(bd, refDate) >= INFANT_AGE_THRESHOLD;
                }).length;
                const extraPeople = billable - 2;
                if (extraPeople <= 0) return null;
                return (
                  <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>
                      {t("registration.extraFeeNotice", {
                        price: formatPrice(extraFeeAmount),
                        extra: extraPeople,
                        nights: state.nightsCount,
                        s: state.nightsCount !== 1 ? "s" : "",
                        total: formatPrice(extraFeeAmount * extraPeople * state.nightsCount),
                      })}{billable < group.participants.length && ` ${t("registration.childrenExempt")}`}
                    </p>
                  </div>
                );
              })()}

              {/* Per-lodging Agreement */}
              {(() => {
                const agreement = getAgreement(group.lodgingType);
                if (!agreement) return null;
                return (
                  <div className="space-y-3 pt-2 border-t">
                    <p className="text-sm font-semibold">{t("registration.lodgingAgreementTitle")}</p>
                    <div className="prose prose-sm dark:prose-invert max-w-none rounded-md p-3">
                      <MarkdownRenderer content={agreement} />
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border p-3">
                      <Checkbox
                        id={`agree-lodging-${gi}`}
                        checked={agreedMap[gi] ?? false}
                        onCheckedChange={(v) =>
                          setAgreedMap((prev) => ({ ...prev, [gi]: v === true }))
                        }
                      />
                      <Label htmlFor={`agree-lodging-${gi}`} className="cursor-pointer text-sm">
                        {t("registration.lodgingAgreementCheck")}
                      </Label>
                    </div>
                  </div>
                );
              })()}

              {/* Special Preferences */}
              {showSpecialPreferences && (
                <div className="space-y-3 pt-2 border-t">
                  <p className="text-sm font-medium text-muted-foreground">{t("registration.specialPreferences")}</p>
                  <div className="flex items-center justify-between">
                    <Label>{t("registration.elderlyLabel")}</Label>
                    <Switch
                      checked={group.preferences.elderly}
                      onCheckedChange={(v) => updatePreference(gi, "elderly", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>{t("registration.handicappedLabel")}</Label>
                    <Switch
                      checked={group.preferences.handicapped}
                      onCheckedChange={(v) =>
                        updatePreference(gi, "handicapped", v)
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>{t("registration.firstFloorLabel")}</Label>
                    <Switch
                      checked={group.preferences.firstFloor}
                      onCheckedChange={(v) =>
                        updatePreference(gi, "firstFloor", v)
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => router.push(`/register/${eventId}/participants`)}
        >
          {t("common.back")}
        </Button>
        <Button onClick={handleNext} disabled={!allAgreementsAccepted}>
          {showKeyDeposit ? t("registration.nextKeyDeposit") : t("registration.nextAirportPickup")}
        </Button>
      </div>
    </div>
  );
}
