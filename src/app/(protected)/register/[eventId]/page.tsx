"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRegistration } from "@/lib/context/registration-context";
import { WizardStepper } from "@/components/registration/wizard-stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { toast } from "sonner";

interface EventData {
  id: string;
  name_en: string;
  event_start_date: string;
  event_end_date: string;
}

interface RegGroup {
  id: string;
  name_en: string;
  name_ko: string | null;
  description_en: string | null;
  access_code: string | null;
  is_default: boolean;
}

export default function RegistrationStep1() {
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const { state, dispatch } = useRegistration();

  const [event, setEvent] = useState<EventData | null>(null);
  const [groups, setGroups] = useState<RegGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessCode, setAccessCode] = useState(state.accessCode ?? "");

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const [{ data: ev }, { data: grps }] = await Promise.all([
        supabase
          .from("ECKCM_events")
          .select("id, name_en, event_start_date, event_end_date")
          .eq("id", eventId)
          .single(),
        supabase
          .from("ECKCM_registration_groups")
          .select("id, name_en, name_ko, description_en, access_code, is_default")
          .eq("event_id", eventId)
          .eq("is_active", true)
          .order("created_at"),
      ]);
      setEvent(ev);
      setGroups(grps ?? []);

      // Default dates to event dates if not set
      if (!state.startDate && ev) {
        dispatch({
          type: "SET_DATES",
          startDate: ev.event_start_date,
          endDate: ev.event_end_date,
          nightsCount: calcNights(ev.event_start_date, ev.event_end_date),
        });
      }

      // Default to default group
      if (!state.registrationGroupId && grps) {
        const defaultGroup = grps.find((g) => g.is_default);
        if (defaultGroup) {
          dispatch({
            type: "SET_REGISTRATION_GROUP",
            groupId: defaultGroup.id,
          });
        }
      }

      setLoading(false);
    };
    load();
  }, [eventId, state.startDate, state.registrationGroupId, dispatch]);

  const calcNights = (start: string, end: string) => {
    const d1 = new Date(start);
    const d2 = new Date(end);
    return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 86400000));
  };

  const handleDateChange = (field: "startDate" | "endDate", value: string) => {
    const start = field === "startDate" ? value : state.startDate;
    const end = field === "endDate" ? value : state.endDate;
    dispatch({
      type: "SET_DATES",
      startDate: start,
      endDate: end,
      nightsCount: calcNights(start, end),
    });
  };

  const handleGroupSelect = (groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (group?.access_code && accessCode !== group.access_code) {
      toast.error("This group requires an access code");
      return;
    }
    dispatch({ type: "SET_REGISTRATION_GROUP", groupId });
  };

  const handleNext = () => {
    if (!state.startDate || !state.endDate) {
      toast.error("Please select dates");
      return;
    }
    if (state.nightsCount < 1) {
      toast.error("Minimum 1 night stay required");
      return;
    }
    if (!state.registrationGroupId) {
      toast.error("Please select a registration group");
      return;
    }

    // Check access code for selected group
    const selectedGroup = groups.find(
      (g) => g.id === state.registrationGroupId
    );
    if (
      selectedGroup?.access_code &&
      accessCode !== selectedGroup.access_code
    ) {
      toast.error("Invalid access code for selected group");
      return;
    }

    dispatch({ type: "SET_STEP", step: 2 });
    router.push(`/register/${eventId}/participants`);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl p-4 pt-8 text-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-2xl p-4 pt-8 text-center text-muted-foreground">
        Event not found.
      </div>
    );
  }

  // Filter available groups (public + access-code matched)
  const availableGroups = groups.filter(
    (g) => !g.access_code || g.access_code === accessCode
  );

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <h1 className="text-2xl font-bold text-center">{event.name_en}</h1>
      <WizardStepper currentStep={1} />

      <Card>
        <CardHeader>
          <CardTitle>Step 1: Dates & Group</CardTitle>
          <CardDescription>Select your stay dates and registration group</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Check-in Date</Label>
              <Input
                type="date"
                value={state.startDate}
                min={event.event_start_date}
                max={event.event_end_date}
                onChange={(e) => handleDateChange("startDate", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Check-out Date</Label>
              <Input
                type="date"
                value={state.endDate}
                min={state.startDate || event.event_start_date}
                max={event.event_end_date}
                onChange={(e) => handleDateChange("endDate", e.target.value)}
              />
            </div>
          </div>

          {state.nightsCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {state.nightsCount} night{state.nightsCount > 1 ? "s" : ""}
            </p>
          )}

          {/* Access Code */}
          <div className="space-y-1">
            <Label>Access Code (optional)</Label>
            <Input
              value={accessCode}
              onChange={(e) => {
                setAccessCode(e.target.value);
                dispatch({ type: "SET_ACCESS_CODE", code: e.target.value });
              }}
              placeholder="Enter if you have one"
            />
          </div>

          {/* Registration Group */}
          <div className="space-y-1">
            <Label>Registration Group</Label>
            <Select
              value={state.registrationGroupId ?? ""}
              onValueChange={handleGroupSelect}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a group" />
              </SelectTrigger>
              <SelectContent>
                {availableGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name_en}
                    {g.name_ko ? ` (${g.name_ko})` : ""}
                    {g.is_default ? " - Default" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={handleNext}>Next: Participants</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
