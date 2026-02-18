"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useRegistration } from "@/lib/context/registration-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { WizardStepper } from "@/components/registration/wizard-stepper";
import type { PriceEstimate } from "@/lib/types/registration";

export default function ReviewStep() {
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const { state, hydrated } = useRegistration();
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!state.startDate) {
      router.push(`/register/${eventId}`);
      return;
    }

    const fetchEstimate = async () => {
      try {
        const res = await fetch("/api/registration/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId: state.eventId,
            startDate: state.startDate,
            endDate: state.endDate,
            nightsCount: state.nightsCount,
            registrationGroupId: state.registrationGroupId,
            roomGroups: state.roomGroups,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setEstimate(data);
        }
      } catch {
        // silently fail — pricing section will show fallback
      }
      setLoading(false);
    };

    fetchEstimate();
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hydrated || !state.startDate) {
    return null;
  }

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/registration/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: state.eventId,
          startDate: state.startDate,
          endDate: state.endDate,
          nightsCount: state.nightsCount,
          registrationGroupId: state.registrationGroupId,
          roomGroups: state.roomGroups,
          keyDeposit: state.keyDeposit,
          airportPickup: state.airportPickup,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = `Submission failed (${res.status})`;
        try {
          const err = JSON.parse(text);
          message = err.error || message;
        } catch {
          if (text) message = text;
        }
        toast.error(message);
        setSubmitting(false);
        return;
      }
      const data = await res.json();
      sessionStorage.removeItem("eckcm_registration");
      router.push(
        `/register/${eventId}/payment?registrationId=${data.registrationId}&code=${data.confirmationCode}`
      );
    } catch (err) {
      console.error("[ReviewStep] Submit error:", err);
      toast.error(
        err instanceof Error ? err.message : "Network error. Please try again."
      );
    }
    setSubmitting(false);
  };

  const totalParticipants = state.roomGroups.reduce(
    (sum, g) => sum + g.participants.length,
    0
  );

  const formatDollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <WizardStepper currentStep={7} />
      <h2 className="text-xl font-bold text-center">Review Registration</h2>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Registration Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Dates:</span>
            <span>
              {state.startDate} ~ {state.endDate} ({state.nightsCount} nights)
            </span>
            <span className="text-muted-foreground">Room Groups:</span>
            <span>{state.roomGroups.length}</span>
            <span className="text-muted-foreground">Total Participants:</span>
            <span>{totalParticipants}</span>
            <span className="text-muted-foreground">Total Keys:</span>
            <span>
              {state.roomGroups.reduce((sum, g) => sum + g.keyCount, 0)}
            </span>
            <span className="text-muted-foreground">Airport Pickup:</span>
            <span>{state.airportPickup.needed ? "Yes" : "No"}</span>
          </div>
        </CardContent>
      </Card>

      {/* Participants List */}
      {state.roomGroups.map((group, gi) => (
        <Card key={group.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Group {gi + 1} - {group.participants.length} participant(s), {group.keyCount} key(s)
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {[
                group.lodgingType && `Lodging: ${group.lodgingType.replace("LODGING_", "").replace("_", " ")}`,
                group.preferences.elderly && "Elderly",
                group.preferences.handicapped && "Accessible",
                group.preferences.firstFloor && "1st Floor",
              ]
                .filter(Boolean)
                .join(" · ") || "No special preferences"}
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Birth Year</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.participants.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.firstName} {p.lastName}
                      {p.displayNameKo ? ` (${p.displayNameKo})` : ""}
                    </TableCell>
                    <TableCell>{p.gender}</TableCell>
                    <TableCell>{p.birthYear}</TableCell>
                    <TableCell>{p.isRepresentative ? "Representative" : "Member"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {/* Pricing Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Total</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Calculating...
            </div>
          ) : estimate ? (
            <div className="space-y-2">
              {estimate.breakdown.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>
                    {item.description}
                    {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                  </span>
                  <span>{formatDollars(item.amount)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>{formatDollars(estimate.total)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Unable to calculate pricing. Please proceed and pricing will be finalized.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between pt-4">
        <Button
          variant="outline"
          onClick={() => router.push(`/register/${eventId}/airport-pickup`)}
        >
          Back
        </Button>
        <Button onClick={handleSubmit} disabled={submitting} size="lg">
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Processing...
            </>
          ) : (
            "Next: Payment"
          )}
        </Button>
      </div>
    </div>
  );
}
