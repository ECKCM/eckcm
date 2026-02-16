"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRegistration } from "@/lib/context/registration-context";
import { WizardStepper } from "@/components/registration/wizard-stepper";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AirportPickupStep() {
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const { state, dispatch } = useRegistration();

  const [showKeyDeposit, setShowKeyDeposit] = useState(true);

  useEffect(() => {
    if (!state.startDate) {
      router.push(`/register/${eventId}`);
      return;
    }

    const fetchGroupSettings = async () => {
      if (!state.registrationGroupId) return;
      const supabase = createClient();
      const { data } = await supabase
        .from("eckcm_registration_groups")
        .select("show_key_deposit")
        .eq("id", state.registrationGroupId)
        .single();
      setShowKeyDeposit(data?.show_key_deposit ?? true);
    };
    fetchGroupSettings();
  }, [state.startDate, state.registrationGroupId, router, eventId]);

  if (!state.startDate) {
    return null;
  }

  const handleNext = () => {
    router.push(`/register/${eventId}/review`);
  };

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <WizardStepper currentStep={5} />

      <Card>
        <CardHeader>
          <CardTitle>Step 5: Airport Pickup</CardTitle>
          <CardDescription>
            Do any participants need airport pickup service?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Need airport pickup?</Label>
            <Switch
              checked={state.airportPickup.needed}
              onCheckedChange={(v) =>
                dispatch({
                  type: "SET_AIRPORT_PICKUP",
                  pickup: { ...state.airportPickup, needed: v },
                })
              }
            />
          </div>

          {state.airportPickup.needed && (
            <div className="space-y-1">
              <Label>
                Please provide flight details (arrival date/time, flight number,
                airport, number of people)
              </Label>
              <Textarea
                value={state.airportPickup.details ?? ""}
                onChange={(e) =>
                  dispatch({
                    type: "SET_AIRPORT_PICKUP",
                    pickup: { ...state.airportPickup, details: e.target.value },
                  })
                }
                rows={4}
                placeholder="e.g., Arriving July 15, 2:30 PM, Delta DL1234, Pittsburgh PIT, 3 people"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() =>
            router.push(
              showKeyDeposit
                ? `/register/${eventId}/key-deposit`
                : `/register/${eventId}/lodging`
            )
          }
        >
          Back
        </Button>
        <Button onClick={handleNext}>Review Registration</Button>
      </div>
    </div>
  );
}
