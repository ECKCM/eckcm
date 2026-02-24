"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlaneLanding, PlaneTakeoff, Users, Plane } from "lucide-react";

interface EventOption {
  id: string;
  name_en: string;
}

interface RideWithPassengers {
  id: string;
  direction: "PICKUP" | "DROPOFF";
  scheduled_at: string;
  label: string | null;
  origin: string | null;
  destination: string | null;
  is_active: boolean;
  passengers: Passenger[];
}

interface Passenger {
  registrationRideId: string;
  passengerCount: number;
  flightInfo: string | null;
  confirmationCode: string | null;
  registrantName: string;
  registrantPhone: string | null;
}

export function AirportChecklist() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [rides, setRides] = useState<RideWithPassengers[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("eckcm_events")
        .select("id, name_en")
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("year", { ascending: false });
      setEvents(data ?? []);
      if (data && data.length > 0) {
        setSelectedEventId(data[0].id);
      }
      setLoading(false);
    })();
  }, []);

  const loadRides = useCallback(async () => {
    if (!selectedEventId) return;
    setLoading(true);
    const supabase = createClient();

    // Fetch rides for this event
    const { data: rideRows } = await supabase
      .from("eckcm_airport_rides")
      .select("id, direction, scheduled_at, label, origin, destination, is_active")
      .eq("event_id", selectedEventId)
      .order("scheduled_at");

    if (!rideRows) {
      setRides([]);
      setLoading(false);
      return;
    }

    // Fetch registration rides with registration info
    const rideIds = rideRows.map((r) => r.id);
    const { data: regRides } = await supabase
      .from("eckcm_registration_rides")
      .select(
        `id, ride_id, passenger_count, flight_info,
         eckcm_registrations!inner(
           confirmation_code, status, created_by_user_id,
           eckcm_users!eckcm_registrations_created_by_user_id_fkey(
             eckcm_people:eckcm_user_people!inner(
               eckcm_people!inner(first_name_en, last_name_en, phone)
             )
           )
         )`
      )
      .in("ride_id", rideIds);

    // Build ride map
    const ridesWithPassengers: RideWithPassengers[] = rideRows.map((ride) => {
      const passengers: Passenger[] = [];

      if (regRides) {
        for (const rr of regRides) {
          if (rr.ride_id !== ride.id) continue;
          const reg = rr.eckcm_registrations as any;
          if (!reg || reg.status === "CANCELLED" || reg.status === "DRAFT") continue;

          // Extract registrant name from nested join
          let name = "Unknown";
          let phone: string | null = null;
          try {
            const userPeople = reg.eckcm_users?.eckcm_people;
            if (Array.isArray(userPeople) && userPeople.length > 0) {
              const person = userPeople[0].eckcm_people;
              name = `${person.first_name_en} ${person.last_name_en}`;
              phone = person.phone;
            }
          } catch {
            // fallback
          }

          passengers.push({
            registrationRideId: rr.id,
            passengerCount: rr.passenger_count,
            flightInfo: rr.flight_info,
            confirmationCode: reg.confirmation_code,
            registrantName: name,
            registrantPhone: phone,
          });
        }
      }

      return { ...ride, passengers };
    });

    setRides(ridesWithPassengers);
    setLoading(false);
  }, [selectedEventId]);

  useEffect(() => {
    loadRides();
  }, [loadRides]);

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
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

  const pickups = rides.filter((r) => r.direction === "PICKUP");
  const dropoffs = rides.filter((r) => r.direction === "DROPOFF");

  if (loading && !rides.length) {
    return (
      <p className="text-center text-muted-foreground py-8">Loading...</p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Select value={selectedEventId} onValueChange={setSelectedEventId}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Select event" />
          </SelectTrigger>
          <SelectContent>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name_en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {rides.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Plane className="size-10 mb-3 opacity-40" />
          <p>No airport rides configured for this event.</p>
        </div>
      ) : (
        <>
          {/* Pickups */}
          {pickups.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <PlaneLanding className="size-5" />
                Pickup (Airport → Camp)
              </h2>
              {pickups.map((ride) => (
                <RideCard
                  key={ride.id}
                  ride={ride}
                  checked={checked}
                  onToggleCheck={toggleCheck}
                  formatDateTime={formatDateTime}
                />
              ))}
            </div>
          )}

          {/* Dropoffs */}
          {dropoffs.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <PlaneTakeoff className="size-5" />
                Drop-off (Camp → Airport)
              </h2>
              {dropoffs.map((ride) => (
                <RideCard
                  key={ride.id}
                  ride={ride}
                  checked={checked}
                  onToggleCheck={toggleCheck}
                  formatDateTime={formatDateTime}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RideCard({
  ride,
  checked,
  onToggleCheck,
  formatDateTime,
}: {
  ride: RideWithPassengers;
  checked: Set<string>;
  onToggleCheck: (id: string) => void;
  formatDateTime: (iso: string) => string;
}) {
  const totalPassengers = ride.passengers.reduce(
    (sum, p) => sum + p.passengerCount,
    0
  );

  return (
    <Card className={!ride.is_active ? "opacity-50" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge
              variant={ride.direction === "PICKUP" ? "default" : "secondary"}
            >
              {ride.direction === "PICKUP" ? "Pickup" : "Drop-off"}
            </Badge>
            <CardTitle className="text-base">
              {formatDateTime(ride.scheduled_at)}
            </CardTitle>
            {(ride.origin || ride.destination) && (
              <span className="text-sm text-muted-foreground">
                {ride.origin ?? "—"} → {ride.destination ?? "—"}
              </span>
            )}
            {ride.label && (
              <span className="text-sm text-muted-foreground">
                {ride.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Users className="size-4" />
            <span>
              {totalPassengers} passenger{totalPassengers !== 1 ? "s" : ""}
            </span>
            <span className="mx-1">·</span>
            <span>
              {ride.passengers.length} booking{ride.passengers.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {ride.passengers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No one has signed up for this ride yet.
          </p>
        ) : (
          <div className="space-y-2">
            {ride.passengers.map((p) => (
              <label
                key={p.registrationRideId}
                className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                  checked.has(p.registrationRideId)
                    ? "bg-muted/50 border-primary/30"
                    : "hover:bg-muted/30"
                }`}
              >
                <Checkbox
                  checked={checked.has(p.registrationRideId)}
                  onCheckedChange={() =>
                    onToggleCheck(p.registrationRideId)
                  }
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-medium text-sm ${
                        checked.has(p.registrationRideId)
                          ? "line-through text-muted-foreground"
                          : ""
                      }`}
                    >
                      {p.registrantName}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {p.passengerCount} person{p.passengerCount !== 1 ? "s" : ""}
                    </Badge>
                    {p.confirmationCode && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {p.confirmationCode}
                      </span>
                    )}
                  </div>
                  {p.registrantPhone && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.registrantPhone}
                    </p>
                  )}
                  {p.flightInfo && (
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                      {p.flightInfo}
                    </p>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
