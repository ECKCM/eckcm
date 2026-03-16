"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
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
import { toast } from "sonner";
import { format } from "date-fns";
import { AlertCircle } from "lucide-react";
import { DateRangePicker } from "@/components/registration/date-range-picker";

interface EventData {
  id: string;
  name_en: string;
  event_start_date: string;
  event_end_date: string;
}

interface RegGroup {
  id: string;
  name_en: string;
  access_code: string | null;
  is_default: boolean;
  only_one_person: boolean;
  apply_general_fees_to_members: boolean;
  apply_meal_fees_to_members: boolean;
}

export default function RegistrationStep1() {
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const searchParams = useSearchParams();
  const { state, dispatch } = useRegistration();

  const [event, setEvent] = useState<EventData | null>(null);
  const [groups, setGroups] = useState<RegGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessCode, setAccessCode] = useState(state.accessCode ?? "");
  const [accessCodeApplied, setAccessCodeApplied] = useState(!!state.accessCode);
  const [accessCodeGroupName, setAccessCodeGroupName] = useState("");
  const [hasOtherVolunteers, setHasOtherVolunteers] = useState(state.hasOtherVolunteers ?? false);
  const [existingRegistration, setExistingRegistration] = useState<{
    id: string;
    confirmationCode: string;
    status: string;
  } | null>(null);
  const [userProfile, setUserProfile] = useState<{
    name: string;
    email: string;
  } | null>(null);

  // Set registration type from URL query param (from dashboard selection)
  useEffect(() => {
    const typeParam = searchParams.get("type");
    if (typeParam === "self" || typeParam === "others") {
      dispatch({ type: "SET_REGISTRATION_TYPE", registrationType: typeParam });
    }
  }, [searchParams, dispatch]);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const [{ data: ev }, { data: grps }] = await Promise.all([
        supabase
          .from("eckcm_events")
          .select("id, name_en, event_start_date, event_end_date")
          .eq("id", eventId)
          .single(),
        supabase
          .from("eckcm_registration_groups")
          .select("id, name_en, access_code, is_default, only_one_person, apply_general_fees_to_members, apply_meal_fees_to_members")
          .eq("is_active", true)
          .order("created_at"),
      ]);
      setEvent(ev);
      setGroups(grps ?? []);

      // Fetch user profile for "For Someone Else" confirmation
      if (user) {
        setUserProfile({
          name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "",
          email: user.email || "",
        });

        // Check if user already has an active registration (skip for "others" mode)
        const typeParam = new URLSearchParams(window.location.search).get("type");
        const effectiveType = typeParam === "others" ? "others" : state.registrationType;
        if (effectiveType === "self") {
          const configRes = await fetch("/api/app-config");
          const configData = configRes.ok ? await configRes.json() : {};
          const allowDupReg = configData.allow_duplicate_registration ?? false;

          if (!allowDupReg) {
            const { data: existing } = await supabase
              .from("eckcm_registrations")
              .select("id, confirmation_code, status")
              .eq("event_id", eventId)
              .eq("created_by_user_id", user.id)
              .in("status", ["SUBMITTED", "PAID"])
              .neq("registration_type", "others")
              .limit(1)
              .maybeSingle();

            if (existing) {
              setExistingRegistration({
                id: existing.id,
                confirmationCode: existing.confirmation_code,
                status: existing.status,
              });
            }
          }
        }
      }

      // Default dates to event dates if not set
      if (!state.startDate && ev) {
        dispatch({
          type: "SET_DATES",
          startDate: ev.event_start_date,
          endDate: ev.event_end_date,
          nightsCount: calcNights(ev.event_start_date, ev.event_end_date),
        });
      }

      // Auto-assign default group
      if (!state.registrationGroupId && grps) {
        const defaultGroup = grps.find((g) => g.is_default);
        if (defaultGroup) {
          dispatch({
            type: "SET_REGISTRATION_GROUP",
            groupId: defaultGroup.id,
          });
        }
      }

      // Restore access code group name if returning to this step
      if (state.accessCode && grps) {
        const matched = grps.find(
          (g) => g.access_code && g.access_code === state.accessCode
        );
        if (matched) {
          setAccessCodeGroupName(matched.name_en);
        }
      }

      setLoading(false);
    };
    load();
  }, [eventId, state.startDate, state.registrationGroupId, state.registrationType, dispatch]);

  const calcNights = (start: string, end: string) => {
    const d1 = new Date(start);
    const d2 = new Date(end);
    return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 86400000));
  };

  // Resolve group from access code: match → use it, no match → default
  const resolveGroup = (code: string): RegGroup | undefined => {
    if (code.trim()) {
      const matched = groups.find(
        (g) => g.access_code && g.access_code === code.trim()
      );
      if (matched) return matched;
    }
    return groups.find((g) => g.is_default);
  };

  const handleAccessCodeInput = (value: string) => {
    const sanitized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setAccessCode(sanitized);
    // Reset applied state when code changes
    if (accessCodeApplied) {
      setAccessCodeApplied(false);
      setAccessCodeGroupName("");
      setHasOtherVolunteers(false);
      // Fall back to default group
      const defaultGroup = groups.find((g) => g.is_default);
      if (defaultGroup) {
        dispatch({ type: "SET_REGISTRATION_GROUP", groupId: defaultGroup.id });
      }
      dispatch({ type: "SET_ACCESS_CODE", code: "" });
    }
  };

  const handleApplyAccessCode = () => {
    if (!accessCode.trim()) {
      toast.error("Please enter an access code");
      return;
    }
    const matched = groups.find(
      (g) => g.access_code && g.access_code === accessCode.trim()
    );
    if (!matched) {
      toast.error("Invalid access code");
      return;
    }
    dispatch({ type: "SET_ACCESS_CODE", code: accessCode.trim() });
    dispatch({ type: "SET_REGISTRATION_GROUP", groupId: matched.id });
    setAccessCodeApplied(true);
    setAccessCodeGroupName(matched.name_en);
    toast.success(`Access code applied: ${matched.name_en}`);
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

    // If access code was entered but not applied
    if (accessCode.trim() && !accessCodeApplied) {
      toast.error("Please click Apply to validate your access code");
      return;
    }

    // Resolve group (access code applied > default)
    const group = accessCodeApplied
      ? groups.find((g) => g.id === state.registrationGroupId)
      : resolveGroup("");
    if (!group) {
      toast.error("No registration group available");
      return;
    }

    dispatch({ type: "SET_REGISTRATION_GROUP", groupId: group.id });
    dispatch({ type: "SET_STEP", step: 2 });
    router.push(`/register/${eventId}/instructions`);
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

  if (existingRegistration) {
    return (
      <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
        <h1 className="text-2xl font-bold text-center">{event.name_en}</h1>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertCircle className="size-12 text-amber-500" />
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Already Registered</h2>
                <p className="text-muted-foreground">
                  You already have a registration for this event.
                </p>
                <p className="text-sm text-muted-foreground">
                  Confirmation Code: <span className="font-mono font-semibold text-foreground">{existingRegistration.confirmationCode}</span>
                </p>
              </div>
              <Button onClick={() => router.push("/dashboard")}>
                Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <h1 className="text-2xl font-bold text-center">{event.name_en}</h1>
      <WizardStepper currentStep={1} />

      <Card>
        <CardHeader>
          <CardTitle>Step 1: Dates</CardTitle>
          <CardDescription>
            <span className="font-medium text-foreground">
              Event Dates: {format(new Date(event.event_start_date + "T00:00:00"), "MM.dd.yy")} - {format(new Date(event.event_end_date + "T00:00:00"), "MM.dd.yy")}
            </span>
            <br />
            Select your stay dates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Registration type info */}
          {state.registrationType === "others" && userProfile && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
              <p className="font-medium text-blue-900">
                Registering on behalf of another group
              </p>
              <p className="text-blue-700 mt-1">
                Signed in as <span className="font-semibold">{userProfile.name}</span> (<span className="break-all">{userProfile.email}</span>).
                The registration will be linked to your account.
              </p>
            </div>
          )}

          <DateRangePicker
            startDate={state.startDate}
            endDate={state.endDate}
            eventStartDate={event.event_start_date}
            eventEndDate={event.event_end_date}
            nightsCount={state.nightsCount}
            onDatesChange={(start, end, nights) => {
              dispatch({
                type: "SET_DATES",
                startDate: start,
                endDate: end,
                nightsCount: nights,
              });
            }}
          />

          {/* Access Code */}
          <div className="space-y-2">
            <Label>Access Code (optional)</Label>
            <div className="flex gap-2">
              <Input
                value={accessCode}
                onChange={(e) => handleAccessCodeInput(e.target.value)}
                placeholder="Enter if you have one"
                disabled={accessCodeApplied}
              />
              {!accessCodeApplied ? (
                <Button
                  variant="outline"
                  onClick={handleApplyAccessCode}
                  disabled={!accessCode.trim()}
                  className="shrink-0"
                >
                  Apply
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAccessCode("");
                    setAccessCodeApplied(false);
                    setAccessCodeGroupName("");
                    setHasOtherVolunteers(false);
                    dispatch({ type: "SET_ACCESS_CODE", code: "" });
                    dispatch({ type: "SET_HAS_OTHER_VOLUNTEERS", value: false });
                    const defaultGroup = groups.find((g) => g.is_default);
                    if (defaultGroup) {
                      dispatch({ type: "SET_REGISTRATION_GROUP", groupId: defaultGroup.id });
                    }
                  }}
                  className="shrink-0 text-muted-foreground"
                >
                  Clear
                </Button>
              )}
            </div>
            {accessCodeApplied && (
              <p className="text-sm text-green-700">
                ✓ Applied: {accessCodeGroupName}
              </p>
            )}
          </div>

          {/* Volunteer question — shown only when:
              1. Access code applied
              2. Group allows multiple people (not only_one_person)
              3. At least one fee scope toggle is OFF */}
          {accessCodeApplied && (() => {
            const matched = groups.find((g) => g.id === state.registrationGroupId);
            return matched
              && !matched.only_one_person
              && (!matched.apply_general_fees_to_members || !matched.apply_meal_fees_to_members);
          })() && (
            <div className="space-y-3 rounded-md border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-medium text-blue-900">
                Are there other volunteers among the room members currently staying?
              </p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="otherVolunteers"
                    checked={!hasOtherVolunteers}
                    onChange={() => {
                      setHasOtherVolunteers(false);
                      dispatch({ type: "SET_HAS_OTHER_VOLUNTEERS", value: false });
                    }}
                    className="accent-primary"
                  />
                  <span className="text-sm">No</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="otherVolunteers"
                    checked={hasOtherVolunteers}
                    onChange={() => {
                      setHasOtherVolunteers(true);
                      dispatch({ type: "SET_HAS_OTHER_VOLUNTEERS", value: true });
                    }}
                    className="accent-primary"
                  />
                  <span className="text-sm">Yes</span>
                </label>
              </div>
              {hasOtherVolunteers && (
                <p className="text-xs text-blue-700">
                  You can apply access codes for your members on Step 3 (People).
                </p>
              )}
            </div>
          )}

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Cancel
            </Button>
            <Button onClick={handleNext}>Next: Participants</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
