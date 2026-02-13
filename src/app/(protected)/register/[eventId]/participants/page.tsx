"use client";

import { useState, useEffect, useRef } from "react";
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
import { Plus, Trash2 } from "lucide-react";
import type { ParticipantInput, RoomGroupInput, MealSelection } from "@/lib/types/registration";
import type { Gender, Grade } from "@/lib/types/database";
import { MAX_GROUPS, MAX_PARTICIPANTS_PER_GROUP, GRADE_LABELS } from "@/lib/utils/constants";
import { calculateAge } from "@/lib/utils/validators";
import { MealSelectionGrid } from "@/components/registration/meal-selection-grid";
import { BirthDatePicker } from "@/components/shared/birth-date-picker";

function createEmptyParticipant(isLeader: boolean): ParticipantInput {
  return {
    id: crypto.randomUUID(),
    isLeader,
    isExistingPerson: false,
    lastName: "",
    firstName: "",
    displayNameKo: "",
    gender: "MALE",
    birthYear: 2000,
    birthMonth: 1,
    birthDay: 1,
    isK12: false,
    phone: "",
    email: "",
    mealSelections: [],
  };
}

function createEmptyGroup(): RoomGroupInput {
  return {
    id: crypto.randomUUID(),
    participants: [createEmptyParticipant(true)],
    preferences: { elderly: false, handicapped: false, firstFloor: false },
    keyCount: 1,
  };
}

export default function ParticipantsStep() {
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const { state, dispatch } = useRegistration();
  const leaderFilledRef = useRef(false);

  const [departments, setDepartments] = useState<
    { id: string; name_en: string; name_ko: string }[]
  >([]);
  const [churches, setChurches] = useState<
    { id: string; name_en: string; is_other: boolean }[]
  >([]);
  const [eventDates, setEventDates] = useState<{
    eventStartDate: string;
    eventEndDate: string;
  } | null>(null);

  useEffect(() => {
    if (!state.startDate) {
      router.push(`/register/${eventId}`);
      return;
    }
    // Initialize with one group if empty
    if (state.roomGroups.length === 0) {
      dispatch({ type: "ADD_ROOM_GROUP", group: createEmptyGroup() });
    }

    const load = async () => {
      const supabase = createClient();

      // Fetch departments, churches, event dates, and current user's person data
      const { data: { user } } = await supabase.auth.getUser();

      const [{ data: deps }, { data: chs }, { data: ev }] = await Promise.all([
        supabase
          .from("eckcm_departments")
          .select("id, name_en, name_ko")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("eckcm_churches")
          .select("id, name_en, is_other")
          .eq("is_active", true)
          .order("is_other", { ascending: false })
          .order("sort_order"),
        supabase
          .from("eckcm_events")
          .select("event_start_date, event_end_date")
          .eq("id", eventId)
          .single(),
      ]);

      setDepartments(deps ?? []);
      setChurches(chs ?? []);
      if (ev) {
        setEventDates({
          eventStartDate: ev.event_start_date,
          eventEndDate: ev.event_end_date,
        });
      }

      // Auto-fill leader from user's profile (only once)
      if (user && !leaderFilledRef.current) {
        const { data: userPeople } = await supabase
          .from("eckcm_user_people")
          .select("person_id")
          .eq("user_id", user.id)
          .limit(1);

        if (userPeople && userPeople.length > 0) {
          const { data: person } = await supabase
            .from("eckcm_people")
            .select("id, first_name_en, last_name_en, display_name_ko, gender, birth_date, is_k12, grade, email, phone, department_id, church_id, church_other")
            .eq("id", userPeople[0].person_id)
            .single();

          if (person && state.roomGroups.length > 0) {
            const leader = state.roomGroups[0].participants[0];
            // Only fill if leader is still empty (fresh start)
            if (!leader.lastName && !leader.firstName) {
              const bd = person.birth_date ? new Date(person.birth_date + "T00:00:00") : null;
              const filledLeader: ParticipantInput = {
                ...leader,
                isExistingPerson: true,
                personId: person.id,
                lastName: person.last_name_en ?? "",
                firstName: person.first_name_en ?? "",
                displayNameKo: person.display_name_ko ?? "",
                gender: (person.gender as Gender) ?? "MALE",
                birthYear: bd ? bd.getFullYear() : 2000,
                birthMonth: bd ? bd.getMonth() + 1 : 1,
                birthDay: bd ? bd.getDate() : 1,
                isK12: person.is_k12 ?? false,
                grade: (person.grade as Grade) ?? undefined,
                email: person.email ?? "",
                phone: person.phone ?? "",
                departmentId: person.department_id ?? undefined,
                churchId: person.church_id ?? undefined,
                churchOther: person.church_other ?? undefined,
                mealSelections: leader.mealSelections,
              };
              dispatch({
                type: "UPDATE_PARTICIPANT",
                groupIndex: 0,
                participantIndex: 0,
                participant: filledLeader,
              });
              leaderFilledRef.current = true;
            }
          }
        }
      }
    };
    load();
  }, [eventId, state.startDate, state.roomGroups.length, dispatch, router]);

  const addGroup = () => {
    if (state.roomGroups.length >= MAX_GROUPS) {
      toast.error(`Maximum ${MAX_GROUPS} room groups allowed`);
      return;
    }
    dispatch({ type: "ADD_ROOM_GROUP", group: createEmptyGroup() });
  };

  const removeGroup = (index: number) => {
    if (state.roomGroups.length <= 1) {
      toast.error("At least one room group is required");
      return;
    }
    dispatch({ type: "REMOVE_ROOM_GROUP", index });
  };

  const addParticipant = (groupIndex: number) => {
    const group = state.roomGroups[groupIndex];
    if (group.participants.length >= MAX_PARTICIPANTS_PER_GROUP) {
      toast.error(`Maximum ${MAX_PARTICIPANTS_PER_GROUP} participants per group`);
      return;
    }
    const updated = {
      ...group,
      participants: [...group.participants, createEmptyParticipant(false)],
    };
    dispatch({ type: "UPDATE_ROOM_GROUP", index: groupIndex, group: updated });
  };

  const removeParticipant = (groupIndex: number, pIndex: number) => {
    const group = state.roomGroups[groupIndex];
    if (group.participants.length <= 1) {
      toast.error("At least one participant is required");
      return;
    }
    const updated = {
      ...group,
      participants: group.participants.filter((_, i) => i !== pIndex),
    };
    dispatch({ type: "UPDATE_ROOM_GROUP", index: groupIndex, group: updated });
  };

  const updateParticipant = (
    groupIndex: number,
    pIndex: number,
    field: string,
    value: string | number | boolean
  ) => {
    const participant = { ...state.roomGroups[groupIndex].participants[pIndex] };
    (participant as Record<string, unknown>)[field] = value;

    // Auto-detect K-12 based on birth date
    if (field === "birthYear" || field === "birthMonth" || field === "birthDay") {
      const year = field === "birthYear" ? (value as number) : participant.birthYear;
      const month = field === "birthMonth" ? (value as number) : participant.birthMonth;
      const day = field === "birthDay" ? (value as number) : participant.birthDay;
      if (year && month && day) {
        const birthDate = new Date(year, month - 1, day);
        const refDate = eventDates
          ? new Date(eventDates.eventStartDate)
          : new Date(state.startDate);
        participant.isK12 = calculateAge(birthDate, refDate) < 18;
      }
    }

    dispatch({
      type: "UPDATE_PARTICIPANT",
      groupIndex,
      participantIndex: pIndex,
      participant,
    });
  };

  const updateMealSelections = (
    groupIndex: number,
    pIndex: number,
    meals: MealSelection[]
  ) => {
    const participant = { ...state.roomGroups[groupIndex].participants[pIndex] };
    participant.mealSelections = meals;
    dispatch({
      type: "UPDATE_PARTICIPANT",
      groupIndex,
      participantIndex: pIndex,
      participant,
    });
  };

  const isChurchOther = (churchId: string | undefined) => {
    if (!churchId) return false;
    return churches.find((c) => c.id === churchId)?.is_other ?? false;
  };

  // Phone formatting: (XXX) XXX-XXXX
  const formatPhone = (raw: string): string => {
    const digits = raw.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const isValidPhone = (phone: string): boolean => {
    const digits = phone.replace(/\D/g, "");
    return digits.length === 0 || digits.length === 10;
  };

  const isValidEmail = (email: string): boolean => {
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  // Check if dates match event period (no meals needed to display)
  const datesMatchEvent =
    eventDates &&
    state.startDate === eventDates.eventStartDate &&
    state.endDate === eventDates.eventEndDate;

  const handleNext = () => {
    for (let gi = 0; gi < state.roomGroups.length; gi++) {
      const group = state.roomGroups[gi];
      for (let pi = 0; pi < group.participants.length; pi++) {
        const p = group.participants[pi];
        if (!p.lastName || !p.firstName) {
          toast.error(
            `Group ${gi + 1}, Participant ${pi + 1}: Name is required`
          );
          return;
        }
        if (!p.phone || !isValidPhone(p.phone)) {
          toast.error(
            `Group ${gi + 1}, Participant ${pi + 1}: Valid phone is required`
          );
          return;
        }
        if (!p.email || !isValidEmail(p.email)) {
          toast.error(
            `Group ${gi + 1}, Participant ${pi + 1}: Valid email is required`
          );
          return;
        }
      }
    }
    dispatch({ type: "SET_STEP", step: 3 });
    router.push(`/register/${eventId}/lodging`);
  };

  return (
    <div className="mx-auto max-w-3xl p-4 pt-8 space-y-6">
      <WizardStepper currentStep={2} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Room Groups & Participants</h2>
        <Button variant="outline" size="sm" onClick={addGroup}>
          <Plus className="mr-1 size-4" />
          Add Group
        </Button>
      </div>

      {state.roomGroups.map((group, gi) => (
        <Card key={group.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Room Group {gi + 1}</CardTitle>
              {state.roomGroups.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeGroup(gi)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
            <CardDescription>
              {group.participants.length} participant(s)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {group.participants.map((p, pi) => (
              <div
                key={p.id}
                className="space-y-2 rounded-lg border p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {p.isLeader ? "Leader" : `Member ${pi}`}
                  </span>
                  {!p.isLeader && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeParticipant(gi, pi)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </div>

                {/* Names */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">First Name (EN) <span className="text-destructive">*</span></Label>
                    <Input
                      value={p.firstName}
                      onChange={(e) =>
                        updateParticipant(gi, pi, "firstName", e.target.value)
                      }
                      placeholder="JOHN"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Last Name (EN) <span className="text-destructive">*</span></Label>
                    <Input
                      value={p.lastName}
                      onChange={(e) =>
                        updateParticipant(gi, pi, "lastName", e.target.value)
                      }
                      placeholder="KIM"
                    />
                  </div>
                </div>

                {/* Display Name + Gender */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Display Name</Label>
                    <Input
                      value={p.displayNameKo ?? ""}
                      onChange={(e) =>
                        updateParticipant(gi, pi, "displayNameKo", e.target.value)
                      }
                      placeholder="Scott Kim"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Gender <span className="text-destructive">*</span></Label>
                    <Select
                      value={p.gender}
                      onValueChange={(v) =>
                        updateParticipant(gi, pi, "gender", v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MALE">Male</SelectItem>
                        <SelectItem value="FEMALE">Female</SelectItem>
                        <SelectItem value="OTHERS">Others</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Birth Date */}
                <BirthDatePicker
                  year={p.birthYear}
                  month={p.birthMonth}
                  day={p.birthDay}
                  onYearChange={(v) =>
                    updateParticipant(gi, pi, "birthYear", v ?? 2000)
                  }
                  onMonthChange={(v) =>
                    updateParticipant(gi, pi, "birthMonth", v)
                  }
                  onDayChange={(v) =>
                    updateParticipant(gi, pi, "birthDay", v)
                  }
                />

                {/* K-12 + Grade — hidden if age > 21 at event start */}
                {(() => {
                  const birthDate = new Date(p.birthYear, p.birthMonth - 1, p.birthDay);
                  const refDate = eventDates
                    ? new Date(eventDates.eventStartDate + "T00:00:00")
                    : new Date(state.startDate + "T00:00:00");
                  const age = calculateAge(birthDate, refDate);
                  return age <= 21;
                })() && (
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={p.isK12}
                      onChange={(e) =>
                        updateParticipant(gi, pi, "isK12", e.target.checked)
                      }
                      className="mt-1"
                    />
                    <Label className="text-xs font-normal leading-snug">
                      I am currently a Pre-K/K-12 student (high school or younger)
                    </Label>
                  </div>
                )}
                {p.isK12 && (
                  <div className="space-y-1">
                    <Label className="text-xs">Grade</Label>
                    <Select
                      value={p.grade ?? ""}
                      onValueChange={(v) =>
                        updateParticipant(gi, pi, "grade", v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select grade" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(GRADE_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label.en}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Department */}
                <div className="space-y-1">
                  <Label className="text-xs">Department</Label>
                  <Select
                    value={p.departmentId ?? ""}
                    onValueChange={(v) =>
                      updateParticipant(gi, pi, "departmentId", v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Email */}
                <div className="space-y-1">
                  <Label className="text-xs">Email <span className="text-destructive">*</span></Label>
                  <Input
                    type="email"
                    value={p.email}
                    onChange={(e) =>
                      updateParticipant(gi, pi, "email", e.target.value)
                    }
                    placeholder="email@example.com"
                    disabled={gi === 0 && pi === 0}
                  />
                  {p.email && !isValidEmail(p.email) && (
                    <p className="text-xs text-destructive">Enter a valid email address</p>
                  )}
                </div>

                {/* Phone */}
                <div className="space-y-1">
                  <Label className="text-xs">Phone <span className="text-destructive">*</span></Label>
                  <Input
                    type="tel"
                    value={p.phone}
                    onChange={(e) =>
                      updateParticipant(gi, pi, "phone", formatPhone(e.target.value))
                    }
                    placeholder="(000) 000-0000"
                  />
                  {p.phone && !isValidPhone(p.phone) && (
                    <p className="text-xs text-destructive">Enter 10-digit phone number</p>
                  )}
                </div>

                {/* Church */}
                <div className="space-y-1">
                  <Label className="text-xs">Church</Label>
                  <Select
                    value={p.churchId ?? ""}
                    onValueChange={(v) =>
                      updateParticipant(gi, pi, "churchId", v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {churches
                        .sort((a, b) => {
                          if (a.is_other) return -1;
                          if (b.is_other) return 1;
                          return a.name_en.localeCompare(b.name_en);
                        })
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name_en}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                {isChurchOther(p.churchId) && (
                  <div className="space-y-1">
                    <Label className="text-xs">Church Name</Label>
                    <Input
                      value={p.churchOther ?? ""}
                      onChange={(e) =>
                        updateParticipant(gi, pi, "churchOther", e.target.value)
                      }
                      placeholder="Enter your church name"
                    />
                  </div>
                )}

                {/* Meal Selection - hidden when dates match full event period */}
                {state.startDate && state.endDate && eventDates && !datesMatchEvent && (
                  <MealSelectionGrid
                    startDate={state.startDate}
                    endDate={state.endDate}
                    eventStartDate={eventDates.eventStartDate}
                    eventEndDate={eventDates.eventEndDate}
                    selections={p.mealSelections}
                    onChange={(meals) => updateMealSelections(gi, pi, meals)}
                  />
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => addParticipant(gi)}
            >
              <Plus className="mr-1 size-4" />
              Add Participant
            </Button>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-between pt-4">
        <Button
          variant="outline"
          onClick={() => router.push(`/register/${eventId}`)}
        >
          Back
        </Button>
        <Button onClick={handleNext}>Next: Lodging</Button>
      </div>
    </div>
  );
}
