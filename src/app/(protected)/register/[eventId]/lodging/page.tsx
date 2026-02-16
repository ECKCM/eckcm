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
import { toast } from "sonner";
import { Info } from "lucide-react";

interface LodgingOption {
  code: string;
  name_en: string;
  pricing_type: string;
  amount_cents: number;
}

export default function LodgingStep() {
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const { state, dispatch } = useRegistration();
  const [lodgingOptions, setLodgingOptions] = useState<LodgingOption[]>([]);
  const [hasExtraFee, setHasExtraFee] = useState(false);
  const [extraFeeAmount, setExtraFeeAmount] = useState(0);
  const [showSpecialPreferences, setShowSpecialPreferences] = useState(true);
  const [showKeyDeposit, setShowKeyDeposit] = useState(true);
  const [loading, setLoading] = useState(true);

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
        .select("eckcm_fee_categories!inner(code, name_en, pricing_type, amount_cents)")
        .eq("registration_group_id", state.registrationGroupId!)
        .like("eckcm_fee_categories.code", "LODGING_%");

      if (error) {
        console.error("Failed to fetch lodging options:", error);
        setLoading(false);
        return;
      }

      const all = (data ?? []).map((row: any) => row.eckcm_fee_categories as LodgingOption);

      // Separate selectable options from LODGING_EXTRA
      const selectable = all.filter((o) => o.code !== "LODGING_EXTRA");
      const extra = all.find((o) => o.code === "LODGING_EXTRA");

      setLodgingOptions(selectable);
      setHasExtraFee(!!extra);
      setExtraFeeAmount(extra?.amount_cents ?? 0);

      // Auto-select if only one option
      if (selectable.length === 1) {
        state.roomGroups.forEach((group, gi) => {
          if (!group.lodgingType) {
            const updated = { ...group, lodgingType: selectable[0].code };
            dispatch({ type: "UPDATE_ROOM_GROUP", index: gi, group: updated });
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

  const handleNext = () => {
    // Validate: each room group must have a lodging type selected
    for (let i = 0; i < state.roomGroups.length; i++) {
      if (!state.roomGroups[i].lodgingType) {
        toast.error(`Please select a room type for Room Group ${i + 1}`);
        return;
      }
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
          <CardTitle>Step 4: Lodging</CardTitle>
          <CardDescription>
            {isSingleOption
              ? "Your room assignment has been set for this registration group."
              : "Select your preferred room type for each room group."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {state.roomGroups.map((group, gi) => (
            <div key={group.id} className="space-y-4 rounded-lg border p-4">
              <h3 className="font-medium">
                Room Group {gi + 1} ({group.participants.length} people)
              </h3>

              {/* Lodging Type Selection */}
              {isSingleOption ? (
                // Single option — auto-selected, show info card
                <div className="rounded-lg border-2 border-primary bg-primary/5 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{lodgingOptions[0].name_en}</p>
                      <p className="text-sm text-muted-foreground">
                        {lodgingOptions[0].amount_cents === 0
                          ? "Included"
                          : lodgingOptions[0].pricing_type === "PER_NIGHT"
                            ? `${formatPrice(lodgingOptions[0].amount_cents)}/night`
                            : formatPrice(lodgingOptions[0].amount_cents)}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-primary">Assigned</span>
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

                    return (
                      <button
                        key={option.code}
                        type="button"
                        onClick={() => selectLodging(gi, option.code)}
                        className={`w-full rounded-lg border-2 p-4 text-left transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{option.name_en}</p>
                            <p className="text-sm text-muted-foreground">
                              {option.pricing_type === "PER_NIGHT"
                                ? `${formatPrice(option.amount_cents)}/night`
                                : formatPrice(option.amount_cents)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">
                              {formatPrice(totalEstimate)}
                            </p>
                            {option.pricing_type === "PER_NIGHT" && (
                              <p className="text-xs text-muted-foreground">
                                {state.nightsCount} night{state.nightsCount !== 1 ? "s" : ""}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* LODGING_EXTRA notice for 3+ people */}
              {hasExtraFee && group.participants.length >= 3 && (
                <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
                  <Info className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>
                    An additional lodging fee of {formatPrice(extraFeeAmount)}/night per person
                    applies for each person beyond 2 in this room group (
                    {group.participants.length - 2} extra × {state.nightsCount} night
                    {state.nightsCount !== 1 ? "s" : ""} ={" "}
                    {formatPrice(extraFeeAmount * (group.participants.length - 2) * state.nightsCount)}
                    ).
                  </p>
                </div>
              )}

              {/* Special Preferences */}
              {showSpecialPreferences && (
                <div className="space-y-3 pt-2 border-t">
                  <p className="text-sm font-medium text-muted-foreground">Special Preferences</p>
                  <div className="flex items-center justify-between">
                    <Label>Elderly / Senior member in group</Label>
                    <Switch
                      checked={group.preferences.elderly}
                      onCheckedChange={(v) => updatePreference(gi, "elderly", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Handicapped / Accessibility needed</Label>
                    <Switch
                      checked={group.preferences.handicapped}
                      onCheckedChange={(v) =>
                        updatePreference(gi, "handicapped", v)
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>First floor preferred</Label>
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
          Back
        </Button>
        <Button onClick={handleNext}>
          {showKeyDeposit ? "Next: Key Deposit" : "Next: Airport Pickup"}
        </Button>
      </div>
    </div>
  );
}
