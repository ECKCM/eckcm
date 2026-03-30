"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useRegistration } from "@/lib/context/registration-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Banknote } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { WizardStepper } from "@/components/registration/wizard-stepper";
import type { PriceEstimate, PriceLineItem } from "@/lib/types/registration";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/context";

export default function ReviewStep() {
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const { state, dispatch, hydrated } = useRegistration();
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submitCalledRef = useRef(false);
  const { t } = useI18n();
  const [deptMap, setDeptMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!hydrated) return;
    if (!state.startDate) {
      router.push(`/register/${eventId}`);
      return;
    }

    // Fetch department names for display
    const fetchDepts = async () => {
      const supabase = createClient();
      const { data } = await supabase.from("eckcm_departments").select("id, name_en");
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((d) => { map[d.id] = d.name_en; });
        setDeptMap(map);
      }
    };
    fetchDepts();

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
    if (submitCalledRef.current) return;
    submitCalledRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch("/api/registration/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: state.eventId,
          registrationType: state.registrationType,
          startDate: state.startDate,
          endDate: state.endDate,
          nightsCount: state.nightsCount,
          registrationGroupId: state.registrationGroupId,
          roomGroups: state.roomGroups,
          keyDeposit: state.keyDeposit,
          airportPickup: state.airportPickup,
          additionalRequests: state.additionalRequests || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = `${t("registration.submissionFailed")} (${res.status})`;
        try {
          const err = JSON.parse(text);
          message = err.error || message;
        } catch {
          if (text) message = text;
        }
        toast.error(message);
        setSubmitting(false);
        submitCalledRef.current = false;
        return;
      }
      const data = await res.json();
      dispatch({ type: "SET_STEP", step: 8 });
      sessionStorage.removeItem("eckcm_registration");
      router.push(
        `/register/${eventId}/payment?registrationId=${data.registrationId}&code=${data.confirmationCode}`
      );
      return; // Keep button disabled — don't allow re-submission during navigation
    } catch (err) {
      console.error("[ReviewStep] Submit error:", err);
      toast.error(
        err instanceof Error ? err.message : t("registration.networkError")
      );
      setSubmitting(false);
      submitCalledRef.current = false;
    }
  };

  const totalParticipants = state.roomGroups.reduce(
    (sum, g) => sum + g.participants.length,
    0
  );

  const formatDollars = (cents: number) =>
    cents < 0 ? `-$${(Math.abs(cents) / 100).toFixed(2)}` : `$${(cents / 100).toFixed(2)}`;

  /** YYYY-MM-DD → MM.DD.YYYY */
  const formatDate = (d: string) => {
    const [y, m, dd] = d.split("-");
    return `${m}.${dd}.${y}`;
  };

  /** Calculate age at event start (client-side for display) */
  const calcAge = (birthYear: number, birthMonth: number, birthDay: number) => {
    const eventStart = state.startDate ? new Date(state.startDate + "T00:00:00") : new Date();
    const bd = new Date(birthYear, birthMonth - 1, birthDay);
    let age = eventStart.getFullYear() - bd.getFullYear();
    const mDiff = eventStart.getMonth() - bd.getMonth();
    if (mDiff < 0 || (mDiff === 0 && eventStart.getDate() < bd.getDate())) age--;
    return age;
  };

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <WizardStepper currentStep={7} />
      <h2 className="text-xl font-bold text-center">{t("registration.reviewTitle")}</h2>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>{t("registration.summaryTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">{t("registration.dates")}:</span>
            <span>
              {formatDate(state.startDate)} ~ {formatDate(state.endDate)} ({state.nightsCount} {t("registration.nights")})
            </span>
            <span className="text-muted-foreground">{t("registration.roomGroups")}:</span>
            <span>{state.roomGroups.length}</span>
            <span className="text-muted-foreground">{t("registration.totalParticipants")}:</span>
            <span>{totalParticipants}</span>
            <span className="text-muted-foreground">{t("registration.totalKeys")}:</span>
            <span>
              {state.roomGroups.reduce((sum, g) => sum + g.keyCount, 0)}
            </span>
            <span className="text-muted-foreground">{t("registration.airportRides")}:</span>
            <span>
              {state.airportPickup.selectedRides?.length
                ? t("registration.ridesPassengers", { rides: state.airportPickup.selectedRides.length, passengers: state.airportPickup.selectedRides.reduce((sum, r) => sum + (r.selectedParticipantIds?.length ?? 0), 0) })
                : t("common.none")}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Room Groups with Pricing & Total */}
      <Card>
      {state.roomGroups.map((group, gi) => {
        // Group-level fee items (lodging, additional lodging)
        const groupFeeItems: PriceLineItem[] = estimate
          ? estimate.breakdown.filter((item) => {
              const prefix = `Group ${gi + 1}:`;
              if (item.category === "lodging" || item.category === "additional_lodging") {
                return item.description.startsWith(prefix);
              }
              // Waived lodging items (no category, from computeWaivedBenefits)
              if (!item.category && item.description.startsWith(prefix)) return true;
              return false;
            })
          : [];

        return (
          <div key={group.id}>
            {gi > 0 && <Separator className="my-4" />}
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Group{state.roomGroups.length > 1 ? ` ${gi + 1}` : ""} - {group.participants.length} participant(s), {group.keyCount} key(s)
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {[
                  group.lodgingType && `Lodging: ${group.lodgingType.replace("LODGING_", "").replace("_", " ")}`,
                  group.preferences.elderly && t("registration.elderly"),
                  group.preferences.handicapped && t("registration.accessible"),
                  group.preferences.firstFloor && t("registration.firstFloor"),
                ]
                  .filter(Boolean)
                  .join(" · ") || t("registration.noSpecialPrefs")}
              </p>
            </CardHeader>
            <CardContent className="space-y-0 pb-3">
              {group.participants.map((p, pi) => {
                const pItems = estimate?.participantBreakdown?.[p.id] ?? [];
                const pTotal = pItems.reduce((sum, item) => sum + item.amount, 0);
                return (
                  <div key={p.id}>
                    {pi > 0 && <Separator className="my-3" />}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm">
                          {p.firstName} {p.lastName}
                          {p.displayNameKo ? ` (${p.displayNameKo})` : ""}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[
                            p.birthYear ? `Age ${calcAge(p.birthYear, p.birthMonth ?? 1, p.birthDay ?? 1)}` : null,
                            p.departmentId ? (deptMap[p.departmentId] ?? null) : null,
                          ].filter(Boolean).join(" · ")}
                        </div>
                        {p.isDateOverridden && p.checkInDate && p.checkOutDate && (
                          <div className="text-xs text-muted-foreground">
                            {formatDate(p.checkInDate)} ~ {formatDate(p.checkOutDate)}
                          </div>
                        )}
                      </div>
                      {!loading && estimate && pItems.length > 0 && (
                        <span className="text-sm font-semibold shrink-0">
                          {pTotal === 0 ? t("common.free") : formatDollars(pTotal)}
                        </span>
                      )}
                    </div>
                    {/* Per-person fee breakdown */}
                    {!loading && estimate && pItems.length > 0 && (
                      <div className="mt-1 ml-3 space-y-0.5">
                        {pItems.map((item, i) => (
                          <div key={i} className={`flex justify-between text-xs ${item.amount === 0 ? "text-green-600" : "text-muted-foreground"}`}>
                            <span>
                              {item.category === "meal"
                                ? item.description.replace(/^Meals - .+? \(/, "Meals (")
                                : item.description}
                              {item.quantity > 1 && item.unitPrice > 0
                                ? ` (${formatDollars(item.unitPrice)} x ${item.quantity})`
                                : ""}
                            </span>
                            <span>{item.amount === 0 ? t("common.free") : formatDollars(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Group-level fees (lodging, additional lodging) */}
              {!loading && estimate && groupFeeItems.length > 0 && (
                <>
                  <Separator className="my-3" />
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium text-muted-foreground mb-1">Room</div>
                    {groupFeeItems.map((item, i) => (
                      <div key={i} className={`flex justify-between text-xs ${item.amount === 0 ? "text-green-600" : "text-muted-foreground"}`}>
                        <span>
                          {item.description.replace(/^Group \d+: /, "")}
                          {item.quantity > 1 && item.unitPrice > 0
                            ? ` (${formatDollars(item.unitPrice)} x ${item.quantity})`
                            : ""}
                        </span>
                        <span>{item.amount === 0 ? t("common.free") : formatDollars(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </div>
        );
      })}

      {/* Total */}
      <div className="px-6"><Separator /></div>
      <div className="px-6 pt-3 pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {t("registration.calculating")}
            </div>
          ) : estimate ? (
            <div className="space-y-0.5">
              {/* Shared fees: key deposit, funding, standalone waived items */}
              {estimate.breakdown
                .filter((item) => {
                  const cat = item.category;
                  if (cat === "registration" || cat === "meal" || cat === "vbs") return false;
                  if (cat === "lodging" || cat === "additional_lodging") return false;
                  if (!cat && item.description.match(/^Group \d+:/)) return false;
                  return true;
                })
                .map((item, i) => (
                  <div key={i} className={`flex justify-between text-xs ${item.amount <= 0 ? "text-green-600" : "text-muted-foreground"}`}>
                    <span>
                      {item.description}
                      {item.quantity > 1 && item.unitPrice > 0
                        ? ` (${formatDollars(item.unitPrice)} x ${item.quantity})`
                        : ""}
                    </span>
                    <span>{item.amount === 0 ? t("common.free") : formatDollars(item.amount)}</span>
                  </div>
                ))}
              <Separator className="my-2" />
              <div className="flex justify-between font-bold text-sm">
                <span>{t("common.total")}</span>
                <span>{formatDollars(estimate.total)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("registration.pricingUnavailable")}
            </p>
          )}
      </div>
      </Card>

      {/* Manual payment discount banner */}
      {!loading && estimate && estimate.manualPaymentDiscount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <Banknote className="h-5 w-5 text-green-600 shrink-0" />
          <p className="text-sm font-medium text-green-800">
            {t("registration.saveWithManual", { amount: formatDollars(estimate.manualPaymentDiscount) })}
          </p>
        </div>
      )}

      {/* Additional Requests */}
      <Card>
        <CardHeader>
          <CardTitle>{t("registration.additionalRequests")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="additional-requests" className="text-sm text-muted-foreground">
              {t("registration.additionalRequestsDesc")}
            </Label>
            <Textarea
              id="additional-requests"
              value={state.additionalRequests ?? ""}
              onChange={(e) => dispatch({ type: "SET_ADDITIONAL_REQUESTS", text: e.target.value })}
              placeholder={t("registration.additionalRequestsPlaceholder")}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between pt-4">
        <Button
          variant="outline"
          onClick={() => router.push(`/register/${eventId}/airport-pickup`)}
        >
          {t("common.back")}
        </Button>
        <Button onClick={handleSubmit} disabled={submitting} size="lg">
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {t("common.processing")}
            </>
          ) : (
            t("registration.nextPayment")
          )}
        </Button>
      </div>
    </div>
  );
}
