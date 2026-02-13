"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
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

export default function LodgingStep() {
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const { state, dispatch } = useRegistration();

  useEffect(() => {
    if (!state.startDate) {
      router.push(`/register/${eventId}`);
    }
  }, [state.startDate, router, eventId]);

  if (!state.startDate) {
    return null;
  }

  const updatePreference = (
    groupIndex: number,
    key: "elderly" | "handicapped" | "firstFloor",
    value: boolean
  ) => {
    const group = { ...state.roomGroups[groupIndex] };
    group.preferences = { ...group.preferences, [key]: value };
    dispatch({ type: "UPDATE_ROOM_GROUP", index: groupIndex, group });
  };

  const handleNext = () => {
    dispatch({ type: "SET_STEP", step: 4 });
    router.push(`/register/${eventId}/key-deposit`);
  };

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <WizardStepper currentStep={3} />

      <Card>
        <CardHeader>
          <CardTitle>Step 3: Lodging Preferences</CardTitle>
          <CardDescription>
            Select special lodging preferences for each room group
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {state.roomGroups.map((group, gi) => (
            <div key={group.id} className="space-y-3 rounded-lg border p-4">
              <h3 className="font-medium">
                Room Group {gi + 1} ({group.participants.length} people)
              </h3>
              <div className="space-y-3">
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
        <Button onClick={handleNext}>Next: Key Deposit</Button>
      </div>
    </div>
  );
}
