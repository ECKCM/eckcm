"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import type { Gender, Grade } from "@/lib/types/database";

interface EventOption {
  id: string;
  name_en: string;
  event_start_date: string;
  event_end_date: string;
}

interface RegGroupOption {
  id: string;
  name_en: string;
  is_default: boolean;
}

interface DeptOption {
  id: string;
  name_en: string;
}

interface ChurchOption {
  id: string;
  name_en: string;
  is_other: boolean;
}

interface LodgingOption {
  code: string;
  name_en: string;
}

interface ParticipantForm {
  clientId: string;
  isRepresentative: boolean;
  firstName: string;
  lastName: string;
  displayNameKo: string;
  gender: Gender;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  isK12: boolean;
  grade: Grade | "";
  departmentId: string;
  churchId: string;
  phone: string;
  email: string;
}

const GENDERS: { value: Gender; label: string }[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
];

const GRADES: { value: Grade; label: string }[] = [
  { value: "PRE_K", label: "Pre-K" },
  { value: "KINDERGARTEN", label: "Kindergarten" },
  { value: "GRADE_1", label: "1st" },
  { value: "GRADE_2", label: "2nd" },
  { value: "GRADE_3", label: "3rd" },
  { value: "GRADE_4", label: "4th" },
  { value: "GRADE_5", label: "5th" },
  { value: "GRADE_6", label: "6th" },
  { value: "GRADE_7", label: "7th" },
  { value: "GRADE_8", label: "8th" },
  { value: "GRADE_9", label: "9th" },
  { value: "GRADE_10", label: "10th" },
  { value: "GRADE_11", label: "11th" },
  { value: "GRADE_12", label: "12th" },
];

function newParticipant(isRep: boolean): ParticipantForm {
  return {
    clientId: crypto.randomUUID(),
    isRepresentative: isRep,
    firstName: "",
    lastName: "",
    displayNameKo: "",
    gender: "MALE",
    birthYear: "1990",
    birthMonth: "1",
    birthDay: "1",
    isK12: false,
    grade: "",
    departmentId: "",
    churchId: "",
    phone: "",
    email: "",
  };
}

export function AdminRegistrationForm() {
  const router = useRouter();
  const [events, setEvents] = useState<EventOption[]>([]);
  const [regGroups, setRegGroups] = useState<RegGroupOption[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [churches, setChurches] = useState<ChurchOption[]>([]);
  const [lodgingOptions, setLodgingOptions] = useState<LodgingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [eventId, setEventId] = useState("");
  const [regGroupId, setRegGroupId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [lodgingType, setLodgingType] = useState("");
  const [keyCount, setKeyCount] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("MANUAL");
  const [note, setNote] = useState("");
  const [participants, setParticipants] = useState<ParticipantForm[]>([
    newParticipant(true),
  ]);

  // Load events, departments, churches on mount
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [eventsRes, deptsRes, churchesRes] = await Promise.all([
        supabase
          .from("eckcm_events")
          .select("id, name_en, event_start_date, event_end_date")
          .eq("is_active", true)
          .order("year", { ascending: false }),
        supabase
          .from("eckcm_departments")
          .select("id, name_en")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("eckcm_churches")
          .select("id, name_en, is_other")
          .eq("is_active", true)
          .order("sort_order"),
      ]);
      setEvents(eventsRes.data ?? []);
      setDepartments(deptsRes.data ?? []);
      setChurches(churchesRes.data ?? []);

      if (eventsRes.data?.length) {
        const ev = eventsRes.data[0];
        setEventId(ev.id);
        setStartDate(ev.event_start_date);
        setEndDate(ev.event_end_date);
      }
      setLoading(false);
    })();
  }, []);

  // Load registration groups + lodging options when event changes
  const loadGroupsAndFees = useCallback(async () => {
    if (!eventId) return;
    const supabase = createClient();

    const { data: groups } = await supabase
      .from("eckcm_registration_groups")
      .select("id, name_en, is_default")
      .eq("is_active", true);

    setRegGroups(groups ?? []);
    if (groups?.length) {
      const defaultGroup = groups.find((g) => g.is_default) ?? groups[0];
      setRegGroupId(defaultGroup.id);

      // Load lodging options from fee categories linked to this group
      const { data: feeLinks } = await supabase
        .from("eckcm_registration_group_fee_categories")
        .select("eckcm_fee_categories!inner(code, name_en)")
        .eq("registration_group_id", defaultGroup.id);

      const lodging = (feeLinks ?? [])
        .map((r: any) => r.eckcm_fee_categories)
        .filter((f: any) => f.code.startsWith("LODGING_"));

      setLodgingOptions(lodging);
      if (lodging.length > 0) setLodgingType(lodging[0].code);
    }
  }, [eventId]);

  useEffect(() => {
    loadGroupsAndFees();
  }, [loadGroupsAndFees]);

  // Update dates when event changes
  useEffect(() => {
    const ev = events.find((e) => e.id === eventId);
    if (ev) {
      setStartDate(ev.event_start_date);
      setEndDate(ev.event_end_date);
    }
  }, [eventId, events]);

  // Reload lodging options when registration group changes
  useEffect(() => {
    if (!regGroupId) return;
    (async () => {
      const supabase = createClient();
      const { data: feeLinks } = await supabase
        .from("eckcm_registration_group_fee_categories")
        .select("eckcm_fee_categories!inner(code, name_en)")
        .eq("registration_group_id", regGroupId);

      const lodging = (feeLinks ?? [])
        .map((r: any) => r.eckcm_fee_categories)
        .filter((f: any) => f.code.startsWith("LODGING_"));

      setLodgingOptions(lodging);
      if (lodging.length > 0 && !lodging.find((l: any) => l.code === lodgingType)) {
        setLodgingType(lodging[0].code);
      }
    })();
  }, [regGroupId, lodgingType]);

  const nightsCount = (() => {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate + "T00:00:00");
    const e = new Date(endDate + "T00:00:00");
    return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000));
  })();

  const updateParticipant = (index: number, updates: Partial<ParticipantForm>) => {
    setParticipants((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...updates } : p))
    );
  };

  const addParticipant = () => {
    setParticipants((prev) => [...prev, newParticipant(false)]);
  };

  const removeParticipant = (index: number) => {
    if (participants.length <= 1) return;
    setParticipants((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // Ensure at least one representative
      if (!next.some((p) => p.isRepresentative) && next.length > 0) {
        next[0].isRepresentative = true;
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    // Validation
    for (const p of participants) {
      if (!p.firstName.trim() || !p.lastName.trim()) {
        toast.error("All participants must have first and last names");
        return;
      }
      if (!p.birthYear || !p.birthMonth || !p.birthDay) {
        toast.error("All participants must have a birth date");
        return;
      }
    }

    if (!eventId || !regGroupId) {
      toast.error("Event and registration group are required");
      return;
    }

    setSubmitting(true);

    const body = {
      eventId,
      startDate,
      endDate,
      nightsCount,
      registrationGroupId: regGroupId,
      roomGroups: [
        {
          id: crypto.randomUUID(),
          lodgingType: lodgingType || undefined,
          keyCount,
          preferences: { elderly: false, handicapped: false, firstFloor: false },
          participants: participants.map((p) => ({
            id: p.clientId,
            isRepresentative: p.isRepresentative,
            isExistingPerson: false,
            firstName: p.firstName.trim().toUpperCase(),
            lastName: p.lastName.trim().toUpperCase(),
            displayNameKo: p.displayNameKo || undefined,
            gender: p.gender,
            birthYear: parseInt(p.birthYear),
            birthMonth: parseInt(p.birthMonth),
            birthDay: parseInt(p.birthDay),
            isK12: p.isK12,
            grade: p.grade || undefined,
            departmentId: p.departmentId || undefined,
            churchId: p.churchId || undefined,
            phone: p.phone || "",
            phoneCountry: "US",
            email: p.email || "",
            mealSelections: [], // API will populate defaults
          })),
        },
      ],
      keyDeposit: keyCount,
      paymentMethod,
      note,
    };

    try {
      const res = await fetch("/api/admin/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to create registration");
        setSubmitting(false);
        return;
      }

      toast.success(
        `Registration created! Code: ${data.confirmationCode} | Total: $${(data.total / 100).toFixed(2)}`
      );
      router.push("/admin/participants");
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-center text-muted-foreground py-8">Loading...</p>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <p className="text-sm text-muted-foreground">
        Create a registration on behalf of a participant (walk-in, phone, etc.).
        The registration will be marked as paid immediately.
      </p>

      {/* Event & Group */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event & Group</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Event *</Label>
              <Select value={eventId} onValueChange={setEventId}>
                <SelectTrigger>
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
            <div className="space-y-1">
              <Label>Registration Group *</Label>
              <Select value={regGroupId} onValueChange={setRegGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  {regGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name_en} {g.is_default && "(Default)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Nights</Label>
              <Input value={nightsCount} disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lodging */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lodging</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Lodging Type</Label>
              <Select value={lodgingType} onValueChange={setLodgingType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {lodgingOptions.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Keys</Label>
              <Input
                type="number"
                min={0}
                max={5}
                value={keyCount}
                onChange={(e) => setKeyCount(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Participants */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Participants{" "}
            <Badge variant="secondary" className="ml-2">
              {participants.length}
            </Badge>
          </CardTitle>
          <Button variant="outline" size="sm" onClick={addParticipant}>
            <Plus className="mr-1 size-4" />
            Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {participants.map((p, idx) => (
            <div
              key={p.clientId}
              className="space-y-3 border rounded-lg p-4 relative"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    Participant {idx + 1}
                  </span>
                  {p.isRepresentative && (
                    <Badge variant="default" className="text-xs">
                      Rep
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={p.isRepresentative}
                      onCheckedChange={(checked) => {
                        setParticipants((prev) =>
                          prev.map((pp, i) => ({
                            ...pp,
                            isRepresentative:
                              i === idx ? checked : checked ? false : pp.isRepresentative,
                          }))
                        );
                      }}
                    />
                    <Label className="text-xs">Rep</Label>
                  </div>
                  {participants.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => removeParticipant(idx)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Name row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">First Name *</Label>
                  <Input
                    value={p.firstName}
                    onChange={(e) =>
                      updateParticipant(idx, {
                        firstName: e.target.value.toUpperCase(),
                      })
                    }
                    placeholder="JOHN"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Last Name *</Label>
                  <Input
                    value={p.lastName}
                    onChange={(e) =>
                      updateParticipant(idx, {
                        lastName: e.target.value.toUpperCase(),
                      })
                    }
                    placeholder="KIM"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Korean Name</Label>
                  <Input
                    value={p.displayNameKo}
                    onChange={(e) =>
                      updateParticipant(idx, { displayNameKo: e.target.value })
                    }
                    placeholder="김철수"
                  />
                </div>
              </div>

              {/* Gender + DOB row */}
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Gender *</Label>
                  <Select
                    value={p.gender}
                    onValueChange={(v) =>
                      updateParticipant(idx, { gender: v as Gender })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((g) => (
                        <SelectItem key={g.value} value={g.value}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Birth Year *</Label>
                  <Input
                    type="number"
                    min={1920}
                    max={2026}
                    value={p.birthYear}
                    onChange={(e) =>
                      updateParticipant(idx, { birthYear: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Month *</Label>
                  <Select
                    value={p.birthMonth}
                    onValueChange={(v) =>
                      updateParticipant(idx, { birthMonth: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {String(i + 1).padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Day *</Label>
                  <Select
                    value={p.birthDay}
                    onValueChange={(v) =>
                      updateParticipant(idx, { birthDay: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {String(i + 1).padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* K12 + Grade */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={p.isK12}
                    onCheckedChange={(checked) =>
                      updateParticipant(idx, { isK12: checked, grade: checked ? p.grade : "" })
                    }
                  />
                  <Label className="text-xs">K-12 Student</Label>
                </div>
                {p.isK12 && (
                  <div className="space-y-1">
                    <Select
                      value={p.grade}
                      onValueChange={(v) =>
                        updateParticipant(idx, { grade: v as Grade })
                      }
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Grade" />
                      </SelectTrigger>
                      <SelectContent>
                        {GRADES.map((g) => (
                          <SelectItem key={g.value} value={g.value}>
                            {g.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Dept + Church row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Department</Label>
                  <Select
                    value={p.departmentId || "none"}
                    onValueChange={(v) =>
                      updateParticipant(idx, {
                        departmentId: v === "none" ? "" : v,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- None --</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Church</Label>
                  <Select
                    value={p.churchId || "none"}
                    onValueChange={(v) =>
                      updateParticipant(idx, {
                        churchId: v === "none" ? "" : v,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- None --</SelectItem>
                      {churches.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Contact row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input
                    value={p.phone}
                    onChange={(e) =>
                      updateParticipant(idx, { phone: e.target.value })
                    }
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={p.email}
                    onChange={(e) =>
                      updateParticipant(idx, { email: e.target.value })
                    }
                    placeholder="john@example.com"
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Payment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Payment Method *</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANUAL">Manual / Cash</SelectItem>
                  <SelectItem value="CHECK">Check</SelectItem>
                  <SelectItem value="ZELLE">Zelle</SelectItem>
                  <SelectItem value="ACH">ACH</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Admin Note</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note (e.g., walk-in registration, phone registration)"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => router.push("/admin/participants")}
        >
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          {submitting ? "Creating..." : "Create Registration"}
        </Button>
      </div>
    </div>
  );
}
