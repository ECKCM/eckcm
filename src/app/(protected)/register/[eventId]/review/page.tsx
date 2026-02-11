"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useRegistration } from "@/lib/context/registration-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import type { PriceEstimate } from "@/lib/types/registration";

export default function ReviewStep() {
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const { state } = useRegistration();
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!state.startDate) {
    router.push(`/register/${eventId}`);
    return null;
  }

  const fetchEstimate = async () => {
    setLoading(true);
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
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to get estimate");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setEstimate(data);
    } catch {
      toast.error("Network error");
    }
    setLoading(false);
  };

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
        const err = await res.json();
        toast.error(err.error || "Submission failed");
        setSubmitting(false);
        return;
      }
      const data = await res.json();
      // Clear session storage
      sessionStorage.removeItem("eckcm_registration");
      // Navigate to payment or confirmation
      router.push(
        `/register/${eventId}/payment?registrationId=${data.registrationId}`
      );
    } catch {
      toast.error("Network error");
    }
    setSubmitting(false);
  };

  const totalParticipants = state.roomGroups.reduce(
    (sum, g) => sum + g.participants.length,
    0
  );

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
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
            <CardDescription>
              {[
                group.preferences.elderly && "Elderly",
                group.preferences.handicapped && "Accessible",
                group.preferences.firstFloor && "1st Floor",
              ]
                .filter(Boolean)
                .join(", ") || "No special preferences"}
            </CardDescription>
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
                    <TableCell>{p.isLeader ? "Leader" : "Member"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {/* Price Estimate */}
      <Card>
        <CardHeader>
          <CardTitle>Price Estimate</CardTitle>
        </CardHeader>
        <CardContent>
          {!estimate ? (
            <Button onClick={fetchEstimate} disabled={loading} className="w-full">
              {loading ? "Calculating..." : "Get Price Estimate"}
            </Button>
          ) : (
            <div className="space-y-3">
              {estimate.breakdown.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>
                    {item.description}
                    {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                  </span>
                  <span>${(item.amount / 100).toFixed(2)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span>${(estimate.total / 100).toFixed(2)}</span>
              </div>
            </div>
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
          {submitting ? "Submitting..." : "Submit Registration"}
        </Button>
      </div>
    </div>
  );
}
