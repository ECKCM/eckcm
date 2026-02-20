"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRegistration } from "@/lib/context/registration-context";
import { WizardStepper } from "@/components/registration/wizard-stepper";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlaneLanding, PlaneTakeoff } from "lucide-react";
import type { AirportRideSelection, ParticipantInput } from "@/lib/types/registration";

interface RideOption {
  id: string;
  direction: "PICKUP" | "DROPOFF";
  scheduled_at: string;
  label: string | null;
  origin: string | null;
  destination: string | null;
}

export default function AirportPickupStep() {
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const { state, dispatch } = useRegistration();

  const [showKeyDeposit, setShowKeyDeposit] = useState(true);
  const [rideOptions, setRideOptions] = useState<RideOption[]>([]);
  const [loadingRides, setLoadingRides] = useState(true);

  // Collect all participants from all room groups
  const allParticipants = useMemo(() => {
    const participants: (ParticipantInput & { groupIndex: number })[] = [];
    state.roomGroups.forEach((group, gi) => {
      group.participants.forEach((p) => {
        participants.push({ ...p, groupIndex: gi });
      });
    });
    return participants;
  }, [state.roomGroups]);

  const allParticipantIds = useMemo(
    () => allParticipants.map((p) => p.id),
    [allParticipants]
  );

  useEffect(() => {
    if (!state.startDate) {
      router.push(`/register/${eventId}`);
      return;
    }

    const fetchData = async () => {
      const supabase = createClient();

      // Fetch group settings for back navigation
      if (state.registrationGroupId) {
        const { data } = await supabase
          .from("eckcm_registration_groups")
          .select("show_key_deposit")
          .eq("id", state.registrationGroupId)
          .single();
        setShowKeyDeposit(data?.show_key_deposit ?? true);
      }

      // Fetch available rides for this event
      const { data: rides } = await supabase
        .from("eckcm_airport_rides")
        .select("id, direction, scheduled_at, label, origin, destination")
        .eq("event_id", eventId)
        .eq("is_active", true)
        .order("scheduled_at");

      setRideOptions(rides ?? []);
      setLoadingRides(false);
    };
    fetchData();
  }, [state.startDate, state.registrationGroupId, router, eventId]);

  if (!state.startDate) {
    return null;
  }

  const selectedRides = state.airportPickup.selectedRides ?? [];

  const isRideSelected = (rideId: string) =>
    selectedRides.some((r) => r.rideId === rideId);

  const getRideSelection = (rideId: string): AirportRideSelection | undefined =>
    selectedRides.find((r) => r.rideId === rideId);

  const toggleRide = (rideId: string) => {
    let updated: AirportRideSelection[];
    if (isRideSelected(rideId)) {
      updated = selectedRides.filter((r) => r.rideId !== rideId);
    } else {
      // Default: all participants selected
      updated = [
        ...selectedRides,
        { rideId, selectedParticipantIds: [...allParticipantIds], flightInfo: "" },
      ];
    }
    dispatch({
      type: "SET_AIRPORT_PICKUP",
      pickup: {
        needed: updated.length > 0,
        selectedRides: updated,
      },
    });
  };

  const toggleParticipant = (rideId: string, participantId: string) => {
    const updated = selectedRides.map((r) => {
      if (r.rideId !== rideId) return r;
      const ids = r.selectedParticipantIds;
      const newIds = ids.includes(participantId)
        ? ids.filter((id) => id !== participantId)
        : [...ids, participantId];
      return { ...r, selectedParticipantIds: newIds };
    });
    dispatch({
      type: "SET_AIRPORT_PICKUP",
      pickup: {
        needed: updated.length > 0,
        selectedRides: updated,
      },
    });
  };

  const updateFlightInfo = (rideId: string, value: string) => {
    const updated = selectedRides.map((r) =>
      r.rideId === rideId ? { ...r, flightInfo: value } : r
    );
    dispatch({
      type: "SET_AIRPORT_PICKUP",
      pickup: {
        needed: updated.length > 0,
        selectedRides: updated,
      },
    });
  };

  const formatDateTime = (iso: string) => {
    const dt = new Date(iso);
    return dt.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const pickups = rideOptions.filter((r) => r.direction === "PICKUP");
  const dropoffs = rideOptions.filter((r) => r.direction === "DROPOFF");

  const handleNext = () => {
    router.push(`/register/${eventId}/review`);
  };

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <WizardStepper currentStep={6} />

      <Card>
        <CardHeader>
          <CardTitle>Step 6: Airport Rides</CardTitle>
          <CardDescription>
            Select the airport rides you need and choose which participants will
            be on each ride.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loadingRides ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Loading available rides...
            </p>
          ) : rideOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No airport rides are available for this event.
            </p>
          ) : (
            <>
              {/* Pickups */}
              {pickups.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <PlaneLanding className="size-4" />
                    Pickup
                    {pickups[0]?.origin || pickups[0]?.destination
                      ? ` (${pickups[0].origin ?? ""} → ${pickups[0].destination ?? ""})`
                      : ""}
                  </h3>
                  {pickups.map((ride) => (
                    <RideCard
                      key={ride.id}
                      ride={ride}
                      selected={isRideSelected(ride.id)}
                      selection={getRideSelection(ride.id)}
                      participants={allParticipants}
                      onToggleRide={() => toggleRide(ride.id)}
                      onToggleParticipant={(pid) =>
                        toggleParticipant(ride.id, pid)
                      }
                      onUpdateFlightInfo={(value) =>
                        updateFlightInfo(ride.id, value)
                      }
                      formatDateTime={formatDateTime}
                    />
                  ))}
                </div>
              )}

              {/* Dropoffs */}
              {dropoffs.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <PlaneTakeoff className="size-4" />
                    Drop-off
                    {dropoffs[0]?.origin || dropoffs[0]?.destination
                      ? ` (${dropoffs[0].origin ?? ""} → ${dropoffs[0].destination ?? ""})`
                      : ""}
                  </h3>
                  {dropoffs.map((ride) => (
                    <RideCard
                      key={ride.id}
                      ride={ride}
                      selected={isRideSelected(ride.id)}
                      selection={getRideSelection(ride.id)}
                      participants={allParticipants}
                      onToggleRide={() => toggleRide(ride.id)}
                      onToggleParticipant={(pid) =>
                        toggleParticipant(ride.id, pid)
                      }
                      onUpdateFlightInfo={(value) =>
                        updateFlightInfo(ride.id, value)
                      }
                      formatDateTime={formatDateTime}
                    />
                  ))}
                </div>
              )}
            </>
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

function RideCard({
  ride,
  selected,
  selection,
  participants,
  onToggleRide,
  onToggleParticipant,
  onUpdateFlightInfo,
  formatDateTime,
}: {
  ride: RideOption;
  selected: boolean;
  selection?: AirportRideSelection;
  participants: (ParticipantInput & { groupIndex: number })[];
  onToggleRide: () => void;
  onToggleParticipant: (participantId: string) => void;
  onUpdateFlightInfo: (value: string) => void;
  formatDateTime: (iso: string) => string;
}) {
  const selectedCount = selection?.selectedParticipantIds?.length ?? 0;

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        selected ? "border-primary bg-primary/5" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {formatDateTime(ride.scheduled_at)}
        </p>
        <Switch checked={selected} onCheckedChange={onToggleRide} />
      </div>

      {selected && (
        <div className="mt-4 space-y-3 border-t pt-3">
          {/* Participant toggles */}
          <div className="space-y-1">
            <Label className="text-xs">
              Passengers ({selectedCount} of {participants.length})
            </Label>
            <div className="space-y-1 mt-1">
              {participants.map((p) => {
                const isChecked =
                  selection?.selectedParticipantIds?.includes(p.id) ?? false;
                return (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => onToggleParticipant(p.id)}
                    />
                    <span className="text-sm">
                      {p.firstName} {p.lastName}
                      {p.displayNameKo ? ` (${p.displayNameKo})` : ""}
                    </span>
                    {participants.length > 1 && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        Group {p.groupIndex + 1}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Flight info */}
          <div className="space-y-1">
            <Label className="text-xs">
              Flight Info (airline, flight #, airport, etc.)
            </Label>
            <Textarea
              value={selection?.flightInfo ?? ""}
              onChange={(e) => onUpdateFlightInfo(e.target.value)}
              rows={2}
              placeholder="e.g., Delta DL1234, PIT, arriving 1:00 PM"
            />
          </div>
        </div>
      )}
    </div>
  );
}
