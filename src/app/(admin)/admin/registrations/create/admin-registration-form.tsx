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
import { GRADE_LABELS } from "@/lib/utils/constants";
import {
  filterName,
  buildDisplayName,
  isValidEmail,
  NAME_PATTERN,
} from "@/lib/utils/field-helpers";
import { calculateAge } from "@/lib/utils/validators";

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
  only_one_person: boolean;
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
  churchOther: string;
  phone: string;
  email: string;
  noEmail: boolean;
  noPhone: boolean;
}

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
    churchOther: "",
    phone: "",
    email: "",
    noEmail: false,
    noPhone: false,
  };
}

export function AdminRegistrationForm() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [regGroups, setRegGroups] = useState<RegGroupOption[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [churches, setChurches] = useState<ChurchOption[]>([]);
  const [lodgingOptions, setLodgingOptions] = useState<LodgingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [allowDuplicateEmail, setAllowDuplicateEmail] = useState(false);

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

  // Per-participant field errors: { index: { fieldName: "error msg" } }
  const [fieldErrors, setFieldErrors] = useState<
    Record<number, Record<string, string>>
  >({});

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load events, departments, churches, app config on mount
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [eventsRes, deptsRes, churchesRes] = await Promise.all([
        supabase
          .from("eckcm_events")
          .select("id, name_en, event_start_date, event_end_date")
          .eq("is_active", true)
          .order("is_default", { ascending: false })
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

      // Fetch app config for duplicate email setting
      try {
        const configRes = await fetch("/api/admin/app-config");
        if (configRes.ok) {
          const configData = await configRes.json();
          setAllowDuplicateEmail(configData.allow_duplicate_email ?? false);
        }
      } catch {}

      setLoading(false);
    })();
  }, []);

  // Load registration groups + lodging options when event changes
  const loadGroupsAndFees = useCallback(async () => {
    if (!eventId) return;
    const supabase = createClient();

    const { data: groups } = await supabase
      .from("eckcm_registration_groups")
      .select("id, name_en, is_default, only_one_person")
      .eq("is_active", true);

    setRegGroups(groups ?? []);
    if (groups?.length) {
      const defaultGroup = groups.find((g) => g.is_default) ?? groups[0];
      setRegGroupId(defaultGroup.id);

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
      if (
        lodging.length > 0 &&
        !lodging.find((l: any) => l.code === lodgingType)
      ) {
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

  const eventStartDate = events.find((e) => e.id === eventId)?.event_start_date;

  const isChurchOther = (churchId: string) => {
    if (!churchId) return false;
    return churches.find((c) => c.id === churchId)?.is_other ?? false;
  };

  const updateParticipant = (
    index: number,
    updates: Partial<ParticipantForm>
  ) => {
    setParticipants((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...updates } : p))
    );
    // Clear field errors for updated fields
    setFieldErrors((prev) => {
      const panelErrs = { ...prev[index] };
      for (const key of Object.keys(updates)) {
        delete panelErrs[key];
      }
      return { ...prev, [index]: panelErrs };
    });
  };

  const handleNameChange = (
    index: number,
    field: "firstName" | "lastName",
    raw: string
  ) => {
    const v = filterName(raw);
    const p = participants[index];
    const first = field === "firstName" ? v : p.firstName;
    const last = field === "lastName" ? v : p.lastName;
    const displayNameKo = buildDisplayName(first, last);
    updateParticipant(index, { [field]: v, displayNameKo });
  };

  const handleBirthChange = (
    index: number,
    field: "birthYear" | "birthMonth" | "birthDay",
    value: string
  ) => {
    const p = participants[index];
    const year = parseInt(field === "birthYear" ? value : p.birthYear) || 2000;
    const month = parseInt(field === "birthMonth" ? value : p.birthMonth) || 1;
    const day = parseInt(field === "birthDay" ? value : p.birthDay) || 1;

    const updates: Partial<ParticipantForm> = { [field]: value };

    // Auto-detect K-12
    if (eventStartDate) {
      const birthDate = new Date(year, month - 1, day);
      const refDate = new Date(eventStartDate + "T00:00:00");
      const age = calculateAge(birthDate, refDate);
      updates.isK12 = age < 18;
      if (age >= 18) updates.grade = "";
    }

    updateParticipant(index, updates);
  };

  const addParticipant = () => {
    setParticipants((prev) => [...prev, newParticipant(false)]);
  };

  const removeParticipant = (index: number) => {
    if (participants.length <= 1) return;
    setParticipants((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (!next.some((p) => p.isRepresentative) && next.length > 0) {
        next[0].isRepresentative = true;
      }
      return next;
    });
    // Clean up field errors
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  // Validate a single participant
  const validateParticipant = (
    p: ParticipantForm,
    idx: number
  ): Record<string, string> => {
    const errs: Record<string, string> = {};

    if (!p.firstName.trim()) errs.firstName = "Required";
    else if (!NAME_PATTERN.test(p.firstName.trim()))
      errs.firstName = "Uppercase letters only";

    if (!p.lastName.trim()) errs.lastName = "Required";
    else if (!NAME_PATTERN.test(p.lastName.trim()))
      errs.lastName = "Uppercase letters only";

    if (!p.displayNameKo?.trim()) errs.displayNameKo = "Required";

    if (!p.departmentId) errs.departmentId = "Required";
    if (!p.churchId) errs.churchId = "Required";
    if (isChurchOther(p.churchId) && !p.churchOther.trim())
      errs.churchOther = "Required";

    if (!p.noEmail) {
      if (!p.email) errs.email = "Required";
      else if (!isValidEmail(p.email)) errs.email = "Enter a valid email";
    }

    if (!p.noPhone) {
      if (!p.phone.trim()) errs.phone = "Required";
    }

    if (p.isK12 && !p.grade) errs.grade = "Required";

    // Representative must be at least 11
    if (idx === 0 && p.isRepresentative && eventStartDate) {
      const birthDate = new Date(
        parseInt(p.birthYear),
        parseInt(p.birthMonth) - 1,
        parseInt(p.birthDay)
      );
      const refDate = new Date(eventStartDate + "T00:00:00");
      if (calculateAge(birthDate, refDate) < 11) {
        errs.birthYear = "Representative must be at least 11 years old";
      }
    }

    return errs;
  };

  const handleSubmit = async () => {
    // Validate all participants
    const allErrors: Record<number, Record<string, string>> = {};
    let hasErrors = false;

    for (let i = 0; i < participants.length; i++) {
      const errs = validateParticipant(participants[i], i);
      if (Object.keys(errs).length > 0) {
        allErrors[i] = errs;
        hasErrors = true;
      }
    }

    // Client-side duplicate checks
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      const birthDate = `${p.birthYear}-${String(parseInt(p.birthMonth)).padStart(2, "0")}-${String(parseInt(p.birthDay)).padStart(2, "0")}`;

      for (let j = 0; j < participants.length; j++) {
        if (i === j) continue;
        const other = participants[j];

        // Email duplicate within form
        if (
          !allowDuplicateEmail &&
          p.email &&
          !p.noEmail &&
          !other.noEmail &&
          other.email &&
          other.email.toLowerCase() === p.email.toLowerCase()
        ) {
          allErrors[i] = { ...allErrors[i], email: "Duplicate email in form" };
          hasErrors = true;
        }

        // Person duplicate within form
        const otherBirthDate = `${other.birthYear}-${String(parseInt(other.birthMonth)).padStart(2, "0")}-${String(parseInt(other.birthDay)).padStart(2, "0")}`;
        if (
          other.firstName &&
          other.lastName &&
          other.firstName.toUpperCase() === p.firstName.toUpperCase() &&
          other.lastName.toUpperCase() === p.lastName.toUpperCase() &&
          otherBirthDate === birthDate &&
          other.gender === p.gender
        ) {
          allErrors[i] = {
            ...allErrors[i],
            firstName: "Duplicate person in form",
          };
          hasErrors = true;
        }
      }
    }

    if (hasErrors) {
      setFieldErrors(allErrors);
      toast.error("Please fix the validation errors before submitting");
      return;
    }

    if (!eventId || !regGroupId) {
      toast.error("Event and registration group are required");
      return;
    }

    setSubmitting(true);
    setFieldErrors({});

    // Server-side duplicate checks via RPC
    const supabase = createClient();
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      const birthDate = `${p.birthYear}-${String(parseInt(p.birthMonth)).padStart(2, "0")}-${String(parseInt(p.birthDay)).padStart(2, "0")}`;

      const { data: dupCheck, error: dupError } = await supabase.rpc(
        "check_registration_duplicates",
        {
          p_event_id: eventId,
          p_email: !p.noEmail && p.email ? p.email.trim() : null,
          p_first_name: p.firstName.trim(),
          p_last_name: p.lastName.trim(),
          p_birth_date: birthDate,
          p_gender: p.gender,
        }
      );

      if (!dupError && dupCheck) {
        const dupErrs: Record<string, string> = {};
        if (dupCheck.emailDuplicate && !allowDuplicateEmail)
          dupErrs.email = "Email already registered for this event";
        if (dupCheck.personDuplicate)
          dupErrs.firstName = "Person already registered for this event";
        if (Object.keys(dupErrs).length > 0) {
          setFieldErrors((prev) => ({ ...prev, [i]: dupErrs }));
          setSubmitting(false);
          toast.error(
            `Participant ${i + 1} (${p.firstName} ${p.lastName}): duplicate detected`
          );
          return;
        }
      }
    }

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
            churchOther:
              isChurchOther(p.churchId) && p.churchOther
                ? p.churchOther
                : undefined,
            phone: p.phone || "",
            phoneCountry: "US",
            email: p.noEmail ? "" : p.email || "",
            noEmail: p.noEmail,
            noPhone: p.noPhone,
            mealSelections: [],
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
      router.push("/admin/registrations");
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !mounted) {
    return (
      <p className="text-center text-muted-foreground py-8">Loading...</p>
    );
  }

  const currentRegGroup = regGroups.find((g) => g.id === regGroupId);
  const isOnlyOnePerson = currentRegGroup?.only_one_person ?? false;

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
          {!isOnlyOnePerson && (
            <Button variant="outline" size="sm" onClick={addParticipant}>
              <Plus className="mr-1 size-4" />
              Add
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {participants.map((p, idx) => {
            const errs = fieldErrors[idx] ?? {};

            return (
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
                                i === idx
                                  ? checked
                                  : checked
                                    ? false
                                    : pp.isRepresentative,
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
                    <Label className="text-xs">
                      First Name *
                    </Label>
                    <Input
                      value={p.firstName}
                      onChange={(e) =>
                        handleNameChange(idx, "firstName", e.target.value)
                      }
                      placeholder="JOHN"
                      className={errs.firstName ? "border-destructive" : ""}
                    />
                    {errs.firstName && (
                      <p className="text-xs text-destructive">
                        {errs.firstName}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Last Name *
                    </Label>
                    <Input
                      value={p.lastName}
                      onChange={(e) =>
                        handleNameChange(idx, "lastName", e.target.value)
                      }
                      placeholder="KIM"
                      className={errs.lastName ? "border-destructive" : ""}
                    />
                    {errs.lastName && (
                      <p className="text-xs text-destructive">
                        {errs.lastName}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Display Name *
                    </Label>
                    <Input
                      value={p.displayNameKo}
                      onChange={(e) =>
                        updateParticipant(idx, {
                          displayNameKo: e.target.value,
                        })
                      }
                      placeholder="NAME ON BADGE"
                      className={
                        errs.displayNameKo ? "border-destructive" : ""
                      }
                    />
                    {errs.displayNameKo && (
                      <p className="text-xs text-destructive">
                        {errs.displayNameKo}
                      </p>
                    )}
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
                        <SelectItem value="MALE">Male</SelectItem>
                        <SelectItem value="FEMALE">Female</SelectItem>
                        <SelectItem value="NON_BINARY">Non-binary</SelectItem>
                        <SelectItem value="PREFER_NOT_TO_SAY">Prefer not to say</SelectItem>
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
                        handleBirthChange(idx, "birthYear", e.target.value)
                      }
                    />
                    {errs.birthYear && (
                      <p className="text-xs text-destructive">
                        {errs.birthYear}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Month *</Label>
                    <Select
                      value={p.birthMonth}
                      onValueChange={(v) =>
                        handleBirthChange(idx, "birthMonth", v)
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
                        handleBirthChange(idx, "birthDay", v)
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
                        updateParticipant(idx, {
                          isK12: checked,
                          grade: checked ? p.grade : "",
                        })
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
                        <SelectTrigger
                          className={`w-[140px] ${errs.grade ? "border-destructive" : ""}`}
                        >
                          <SelectValue placeholder="Grade" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(GRADE_LABELS).map(([key, label]) => (
                            <SelectItem key={key} value={key}>
                              {label.en}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errs.grade && (
                        <p className="text-xs text-destructive">{errs.grade}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Dept + Church row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Department *</Label>
                    <Select
                      value={p.departmentId || "none"}
                      onValueChange={(v) =>
                        updateParticipant(idx, {
                          departmentId: v === "none" ? "" : v,
                        })
                      }
                    >
                      <SelectTrigger
                        className={
                          errs.departmentId ? "border-destructive" : ""
                        }
                      >
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
                    {errs.departmentId && (
                      <p className="text-xs text-destructive">
                        {errs.departmentId}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Church *</Label>
                    <Select
                      value={p.churchId || "none"}
                      onValueChange={(v) =>
                        updateParticipant(idx, {
                          churchId: v === "none" ? "" : v,
                          churchOther: "",
                        })
                      }
                    >
                      <SelectTrigger
                        className={errs.churchId ? "border-destructive" : ""}
                      >
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
                    {errs.churchId && (
                      <p className="text-xs text-destructive">
                        {errs.churchId}
                      </p>
                    )}
                  </div>
                </div>

                {/* Church Other */}
                {isChurchOther(p.churchId) && (
                  <div className="space-y-1">
                    <Label className="text-xs">Church Name *</Label>
                    <Input
                      value={p.churchOther}
                      onChange={(e) =>
                        updateParticipant(idx, { churchOther: e.target.value })
                      }
                      placeholder="Enter church name"
                      className={errs.churchOther ? "border-destructive" : ""}
                    />
                    {errs.churchOther && (
                      <p className="text-xs text-destructive">
                        {errs.churchOther}
                      </p>
                    )}
                  </div>
                )}

                {/* Contact row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    {!p.noPhone && (
                      <>
                        <Label className="text-xs">Phone *</Label>
                        <Input
                          value={p.phone}
                          onChange={(e) =>
                            updateParticipant(idx, { phone: e.target.value })
                          }
                          placeholder="(555) 123-4567"
                          className={errs.phone ? "border-destructive" : ""}
                        />
                        {errs.phone && (
                          <p className="text-xs text-destructive">
                            {errs.phone}
                          </p>
                        )}
                      </>
                    )}
                    {!p.isRepresentative && (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="checkbox"
                          checked={p.noPhone}
                          onChange={(e) =>
                            updateParticipant(idx, {
                              noPhone: e.target.checked,
                              phone: e.target.checked ? "" : p.phone,
                            })
                          }
                        />
                        <Label className="text-xs font-normal">
                          No phone number
                        </Label>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    {!p.noEmail && (
                      <>
                        <Label className="text-xs">Email *</Label>
                        <Input
                          type="email"
                          value={p.email}
                          onChange={(e) =>
                            updateParticipant(idx, { email: e.target.value })
                          }
                          placeholder="john@example.com"
                          className={errs.email ? "border-destructive" : ""}
                        />
                        {errs.email && (
                          <p className="text-xs text-destructive">
                            {errs.email}
                          </p>
                        )}
                      </>
                    )}
                    {!p.isRepresentative && (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="checkbox"
                          checked={p.noEmail}
                          onChange={(e) =>
                            updateParticipant(idx, {
                              noEmail: e.target.checked,
                              email: e.target.checked ? "" : p.email,
                            })
                          }
                        />
                        <Label className="text-xs font-normal">
                          No email address
                        </Label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
          onClick={() => router.push("/admin/registrations")}
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
