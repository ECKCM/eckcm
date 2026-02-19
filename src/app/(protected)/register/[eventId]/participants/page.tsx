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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, CheckCircle2, Info, CircleHelp, User } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ParticipantInput, RoomGroupInput, MealSelection } from "@/lib/types/registration";
import type { Gender, Grade } from "@/lib/types/database";
import { MAX_GROUPS, MAX_PARTICIPANTS_PER_GROUP, GRADE_LABELS } from "@/lib/utils/constants";
import { calculateAge } from "@/lib/utils/validators";
import {
  filterName,
  buildDisplayName,
  isPhoneIncomplete,
  stripDialCode,
  isValidEmail,
  NAME_PATTERN,
} from "@/lib/utils/field-helpers";
import { PhoneInput } from "@/components/shared/phone-input";
import { ChurchCombobox } from "@/components/shared/church-combobox";
import { MealSelectionGrid } from "@/components/registration/meal-selection-grid";
import { BirthDatePicker } from "@/components/shared/birth-date-picker";

function createEmptyParticipant(isRepresentative: boolean): ParticipantInput {
  return {
    id: crypto.randomUUID(),
    isRepresentative,
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
    phoneCountry: "US",
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
  const representativeFilledRef = useRef(false);
  const groupInitRef = useRef(false);

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
  const [regGroups, setRegGroups] = useState<
    { id: string; department_id: string | null; is_default: boolean; only_one_person: boolean }[]
  >([]);

  // Track which participants are open (accordion state)
  // Key: "gi-pi", value: open/closed
  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>({
    "0-0": true, // First representative starts open
  });

  // Track which participants have been saved
  const [savedPanels, setSavedPanels] = useState<Record<string, boolean>>({});
  const [savingPanel, setSavingPanel] = useState<string | null>(null);

  // Per-participant inline field errors: { "gi-pi": { fieldName: "error msg" } }
  const [fieldErrors, setFieldErrors] = useState<Record<string, Record<string, string>>>({});

  // Confirmation dialog for removing a participant
  const [removeTarget, setRemoveTarget] = useState<{
    gi: number;
    pi: number;
    name: string;
  } | null>(null);

  // Confirmation dialog for removing an entire group
  const [removeGroupTarget, setRemoveGroupTarget] = useState<number | null>(null);

  // HANSAMO policy: representative-only registration unless general lodging opted
  const [hansamoGeneralLodging, setHansamoGeneralLodging] = useState(false);

  const isHansamoDept = (deptId: string | undefined) => {
    if (!deptId) return false;
    return departments.find((d) => d.id === deptId)?.name_en?.includes("HANSAMO") ?? false;
  };

  // True when Group 1 Representative selected HANSAMO and did NOT opt for general lodging
  const representativeDeptId = state.roomGroups[0]?.participants[0]?.departmentId;
  const isHansamoRestricted = isHansamoDept(representativeDeptId) && !hansamoGeneralLodging;

  // True when current registration group enforces single-person registration
  const currentRegGroup = regGroups.find((g) => g.id === state.registrationGroupId);
  const isOnlyOnePerson = currentRegGroup?.only_one_person ?? false;

  const togglePanel = (key: string) => {
    setOpenPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    if (!state.startDate) {
      router.push(`/register/${eventId}`);
      return;
    }
    // Initialize with one group if empty (ref guard prevents double-dispatch in strict mode)
    if (state.roomGroups.length === 0 && !groupInitRef.current) {
      groupInitRef.current = true;
      dispatch({ type: "ADD_ROOM_GROUP", group: createEmptyGroup() });
    }

    const load = async () => {
      const supabase = createClient();

      const { data: { user } } = await supabase.auth.getUser();

      const [{ data: deps }, { data: chs }, { data: ev }, { data: rgs }] = await Promise.all([
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
        supabase
          .from("eckcm_registration_groups")
          .select("id, department_id, is_default, only_one_person")
          .eq("is_active", true),
      ]);

      setDepartments(deps ?? []);
      setChurches(chs ?? []);
      setRegGroups(rgs ?? []);
      if (ev) {
        setEventDates({
          eventStartDate: ev.event_start_date,
          eventEndDate: ev.event_end_date,
        });
      }

      // Auto-fill representative from user's profile (only once)
      if (user && !representativeFilledRef.current) {
        // Check for existing drafts
        const { data: drafts } = await supabase
          .from("eckcm_registration_drafts")
          .select("participant_client_id")
          .eq("user_id", user.id)
          .eq("event_id", eventId);

        if (drafts && drafts.length > 0) {
          // Mark saved panels
          const saved: Record<string, boolean> = {};
          // We'll match by participant_client_id later
          // For now just track that drafts exist
          drafts.forEach(() => {
            // Will be matched after groups are loaded
          });
          setSavedPanels(saved);
        }

        const { data: userPeople } = await supabase
          .from("eckcm_user_people")
          .select("person_id")
          .eq("user_id", user.id)
          .limit(1);

        if (userPeople && userPeople.length > 0) {
          const { data: person } = await supabase
            .from("eckcm_people")
            .select("id, first_name_en, last_name_en, display_name_ko, gender, birth_date, is_k12, grade, email, phone, phone_country, department_id, church_id, church_other")
            .eq("id", userPeople[0].person_id)
            .single();

          if (person && state.roomGroups.length > 0) {
            const representative = state.roomGroups[0].participants[0];
            // Only fill if representative is still empty (fresh start)
            if (!representative.lastName && !representative.firstName) {
              const bd = person.birth_date ? new Date(person.birth_date + "T00:00:00") : null;
              const filledRepresentative: ParticipantInput = {
                ...representative,
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
                phone: stripDialCode(person.phone ?? "", person.phone_country ?? "US"),
                phoneCountry: person.phone_country ?? "US",
                departmentId: person.department_id ?? undefined,
                churchId: person.church_id ?? undefined,
                churchOther: person.church_other ?? undefined,
                mealSelections: [], // always recalculate from dates
              };
              dispatch({
                type: "UPDATE_PARTICIPANT",
                groupIndex: 0,
                participantIndex: 0,
                participant: filledRepresentative,
              });
              representativeFilledRef.current = true;
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
    const newGroup = createEmptyGroup();
    dispatch({ type: "ADD_ROOM_GROUP", group: newGroup });
    // Open the new group's representative
    const newGi = state.roomGroups.length;
    setOpenPanels((prev) => ({ ...prev, [`${newGi}-0`]: true }));
  };

  const removeGroup = (index: number) => {
    dispatch({ type: "REMOVE_ROOM_GROUP", index });
    // Clean up saved/error state for removed group's participants
    const group = state.roomGroups[index];
    group.participants.forEach((_, pi) => {
      const key = `${index}-${pi}`;
      setSavedPanels((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    });
  };

  const addParticipant = (groupIndex: number) => {
    const group = state.roomGroups[groupIndex];
    if (group.participants.length >= MAX_PARTICIPANTS_PER_GROUP) {
      toast.error(`Maximum ${MAX_PARTICIPANTS_PER_GROUP} participants per group`);
      return;
    }
    const newP = createEmptyParticipant(false);
    const updated = {
      ...group,
      participants: [...group.participants, newP],
    };
    dispatch({ type: "UPDATE_ROOM_GROUP", index: groupIndex, group: updated });
    // Open the new participant
    const newPi = group.participants.length;
    setOpenPanels((prev) => ({ ...prev, [`${groupIndex}-${newPi}`]: true }));
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
    // Remove saved state
    const key = `${groupIndex}-${pIndex}`;
    setSavedPanels((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
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

    // Auto-switch registration group when Group 1 representative changes department
    if (groupIndex === 0 && pIndex === 0 && field === "departmentId") {
      const deptGroup = regGroups.find((g) => g.department_id === value);
      if (deptGroup) {
        dispatch({ type: "SET_REGISTRATION_GROUP", groupId: deptGroup.id });
      } else {
        // Fall back to default group
        const defaultGroup = regGroups.find((g) => g.is_default);
        if (defaultGroup) {
          dispatch({ type: "SET_REGISTRATION_GROUP", groupId: defaultGroup.id });
        }
      }
    }

    // Mark as unsaved when edited & clear field error
    const key = `${groupIndex}-${pIndex}`;
    setSavedPanels((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFieldErrors((prev) => {
      const panelErrs = { ...prev[key] };
      delete panelErrs[field];
      return { ...prev, [key]: panelErrs };
    });

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

  const isNoHomeChurch = (churchId: string | undefined) => {
    if (!churchId) return false;
    return churches.find((c) => c.id === churchId)?.name_en === "No Home Church";
  };

  // Name change handler: filter → uppercase, auto-populate displayNameKo
  const handleNameChange = (
    gi: number,
    pi: number,
    field: "firstName" | "lastName",
    raw: string
  ) => {
    const v = filterName(raw);
    const participant = { ...state.roomGroups[gi].participants[pi] };
    (participant as Record<string, unknown>)[field] = v;
    const first = field === "firstName" ? v : participant.firstName;
    const last = field === "lastName" ? v : participant.lastName;
    participant.displayNameKo = buildDisplayName(first, last);

    // Mark as unsaved & clear name-related field errors
    const key = `${gi}-${pi}`;
    setSavedPanels((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFieldErrors((prev) => {
      const panelErrs = { ...prev[key] };
      delete panelErrs[field];
      delete panelErrs.displayNameKo;
      return { ...prev, [key]: panelErrs };
    });

    dispatch({
      type: "UPDATE_PARTICIPANT",
      groupIndex: gi,
      participantIndex: pi,
      participant,
    });
  };

  // Check if dates match event period (no meals needed to display)
  const datesMatchEvent =
    eventDates &&
    state.startDate === eventDates.eventStartDate &&
    state.endDate === eventDates.eventEndDate;

  // Validate a single participant — returns all field errors
  const validateParticipant = (p: ParticipantInput, gi: number, pi: number): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!p.firstName.trim()) errs.firstName = "Required";
    else if (!NAME_PATTERN.test(p.firstName.trim())) errs.firstName = "Uppercase letters only";
    if (!p.lastName.trim()) errs.lastName = "Required";
    else if (!NAME_PATTERN.test(p.lastName.trim())) errs.lastName = "Uppercase letters only";
    if (!p.displayNameKo?.trim()) errs.displayNameKo = "Required";
    if (!p.departmentId) errs.departmentId = "Required";
    if (!p.noEmail) {
      if (!p.email) errs.email = "Required";
      else if (!isValidEmail(p.email)) errs.email = "Enter a valid email";
    }
    if (!p.noPhone) {
      if (!p.phone.trim()) errs.phone = "Required";
      else if (isPhoneIncomplete(p.phone, p.phoneCountry)) errs.phone = "Enter a complete phone number";
    }
    if (p.isK12 && !p.grade) errs.grade = "Required";
    if (!p.churchId) errs.churchId = "Required";
    if (isChurchOther(p.churchId) && !p.churchOther?.trim()) errs.churchOther = "Required";
    // Room Group 1 Representative must be at least 13 by event start
    if (gi === 0 && pi === 0) {
      const birthDate = new Date(p.birthYear, p.birthMonth - 1, p.birthDay);
      const refDate = eventDates
        ? new Date(eventDates.eventStartDate + "T00:00:00")
        : new Date(state.startDate + "T00:00:00");
      if (calculateAge(birthDate, refDate) < 11) {
        errs.birthYear = "Representative must be at least 11 years old";
      }
    }
    return errs;
  };

  // Save participant to draft DB
  const saveParticipant = async (gi: number, pi: number) => {
    const p = state.roomGroups[gi].participants[pi];
    const key = `${gi}-${pi}`;

    // Validate — show inline errors
    const errs = validateParticipant(p, gi, pi);
    if (Object.keys(errs).length > 0) {
      setFieldErrors((prev) => ({ ...prev, [key]: errs }));
      return;
    }
    // Clear errors for this participant
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    // --- Duplicate checks (client-side: within current form) ---
    const birthDate = `${p.birthYear}-${String(p.birthMonth).padStart(2, "0")}-${String(p.birthDay).padStart(2, "0")}`;

    for (let gIdx = 0; gIdx < state.roomGroups.length; gIdx++) {
      for (let pIdx = 0; pIdx < state.roomGroups[gIdx].participants.length; pIdx++) {
        if (gIdx === gi && pIdx === pi) continue;
        const other = state.roomGroups[gIdx].participants[pIdx];

        // Email duplicate within form
        if (p.email && !p.noEmail && !other.noEmail && other.email &&
            other.email.toLowerCase() === p.email.toLowerCase()) {
          setFieldErrors((prev) => ({ ...prev, [key]: { email: "Unable to use this email" } }));
          return;
        }

        // Person duplicate within form (firstName + lastName + birthDate + gender)
        const otherBirthDate = `${other.birthYear}-${String(other.birthMonth).padStart(2, "0")}-${String(other.birthDay).padStart(2, "0")}`;
        if (
          other.firstName && other.lastName &&
          other.firstName.toUpperCase() === p.firstName.toUpperCase() &&
          other.lastName.toUpperCase() === p.lastName.toUpperCase() &&
          otherBirthDate === birthDate &&
          other.gender === p.gender
        ) {
          setFieldErrors((prev) => ({ ...prev, [key]: { firstName: "이미 등록된 사람입니다" } }));
          return;
        }
      }
    }

    setSavingPanel(key);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Not authenticated");
      setSavingPanel(null);
      return;
    }

    // --- Duplicate checks (server-side: against DB via Postgres function) ---
    const { data: dupCheck, error: dupError } = await supabase.rpc(
      "check_registration_duplicates",
      {
        p_event_id: eventId,
        p_email: (!p.noEmail && p.email) ? p.email.trim() : null,
        p_first_name: p.firstName.trim(),
        p_last_name: p.lastName.trim(),
        p_birth_date: birthDate,
        p_gender: p.gender,
      }
    );

    if (!dupError && dupCheck) {
      const dupErrs: Record<string, string> = {};
      if (dupCheck.emailDuplicate) dupErrs.email = "Unable to use this email";
      if (dupCheck.personDuplicate) dupErrs.firstName = "이미 등록된 사람입니다";
      if (Object.keys(dupErrs).length > 0) {
        setFieldErrors((prev) => ({ ...prev, [key]: dupErrs }));
        setSavingPanel(null);
        return;
      }
    }

    const { error: dbError } = await supabase
      .from("eckcm_registration_drafts")
      .upsert({
        user_id: user.id,
        event_id: eventId,
        participant_client_id: p.id,
        group_index: gi,
        participant_index: pi,
        is_representative: p.isRepresentative,
        participant_data: p as unknown as Record<string, unknown>,
      }, {
        onConflict: "user_id,event_id,participant_client_id",
      });

    setSavingPanel(null);

    if (dbError) {
      toast.error("Failed to save");
      return;
    }

    // Mark as saved and collapse
    setSavedPanels((prev) => ({ ...prev, [key]: true }));
    setOpenPanels((prev) => ({ ...prev, [key]: false }));
    toast.success(`${p.firstName || "Participant"} saved`);
  };

  const handleNext = () => {
    // Check if current registration group enforces only one person
    const currentRegGroup = regGroups.find((g) => g.id === state.registrationGroupId);
    const isOnlyOnePerson = currentRegGroup?.only_one_person ?? false;

    if (isOnlyOnePerson) {
      // Only Room Group 1 Representative needs to be saved
      if (!savedPanels["0-0"]) {
        toast.error("Please save the participant before proceeding");
        setOpenPanels((prev) => ({ ...prev, "0-0": true }));
        return;
      }
      // Strip extra members from Group 1 and remove extra groups
      const firstGroup = state.roomGroups[0];
      if (firstGroup.participants.length > 1 || state.roomGroups.length > 1) {
        const trimmedGroup: RoomGroupInput = {
          ...firstGroup,
          participants: [firstGroup.participants[0]],
        };
        dispatch({ type: "SET_ROOM_GROUPS", groups: [trimmedGroup] });
      }
    } else {
      // Check all participants are saved
      for (let gi = 0; gi < state.roomGroups.length; gi++) {
        const group = state.roomGroups[gi];
        for (let pi = 0; pi < group.participants.length; pi++) {
          const key = `${gi}-${pi}`;
          if (!savedPanels[key]) {
            toast.error(`Please save all participants before proceeding`);
            // Open the unsaved participant
            setOpenPanels((prev) => ({ ...prev, [key]: true }));
            return;
          }
        }
      }
    }

    dispatch({ type: "SET_STEP", step: 4 });
    router.push(`/register/${eventId}/lodging`);
  };

  return (
    <div className="mx-auto max-w-3xl p-4 pt-8 space-y-6">
      <WizardStepper currentStep={3} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Room Groups & Participants</h2>
        {!isHansamoRestricted && !isOnlyOnePerson && (
          <Button variant="outline" size="sm" onClick={addGroup}>
            <Plus className="mr-1 size-4" />
            Add Group
          </Button>
        )}
      </div>

      {state.roomGroups.map((group, gi) => (
        <Card key={group.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-base">Room Group {gi + 1}</CardTitle>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: group.participants.length }, (_, i) => (
                    <User key={i} className={`h-3.5 w-3.5 ${savedPanels[`${gi}-${i}`] ? "text-green-500" : "text-muted-foreground"}`} />
                  ))}
                </div>
              </div>
              {gi > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRemoveGroupTarget(gi)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
            <CardDescription>
              {group.participants.length} participant(s)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {group.participants.map((p, pi) => {
              const panelKey = `${gi}-${pi}`;
              const isOpen = openPanels[panelKey] ?? false;
              const isSaved = savedPanels[panelKey] ?? false;
              const isSaving = savingPanel === panelKey;
              const errs = fieldErrors[panelKey] ?? {};

              return (
                <Collapsible key={p.id} open={isOpen} onOpenChange={() => togglePanel(panelKey)}>
                  <div className="rounded-lg border">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors rounded-t-lg"
                      >
                        {isSaved ? (
                          <CheckCircle2 className="size-4 shrink-0 text-green-600" />
                        ) : (
                          <div className="size-4 shrink-0 rounded-full border-2 border-muted-foreground/30" />
                        )}
                        <span className="text-sm font-medium flex-1">
                          {p.isRepresentative ? "Representative" : `Member ${pi}`}
                          {(p.firstName || p.lastName) && (
                            <span className="ml-2 font-normal text-muted-foreground">
                              {p.firstName} {p.lastName}
                            </span>
                          )}
                        </span>
                        {!p.isRepresentative && (
                          <span
                            className="p-1 hover:bg-destructive/10 rounded"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRemoveTarget({
                                gi,
                                pi,
                                name: p.firstName || "this participant",
                              });
                            }}
                          >
                            <Trash2 className="size-3 text-muted-foreground" />
                          </span>
                        )}
                        <ChevronDown
                          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="space-y-2 px-3 pb-3 pt-1">
                        {/* Names */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">First Name (Legal) <span className="text-destructive">*</span></Label>
                            <Input
                              value={p.firstName}
                              onChange={(e) =>
                                handleNameChange(gi, pi, "firstName", e.target.value)
                              }
                              placeholder="FIRST NAME"
                              className={errs.firstName ? "border-destructive" : ""}
                            />
                            {errs.firstName && <p className="text-xs text-destructive">{errs.firstName}</p>}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Last Name (Legal) <span className="text-destructive">*</span></Label>
                            <Input
                              value={p.lastName}
                              onChange={(e) =>
                                handleNameChange(gi, pi, "lastName", e.target.value)
                              }
                              placeholder="LAST NAME"
                              className={errs.lastName ? "border-destructive" : ""}
                            />
                            {errs.lastName && <p className="text-xs text-destructive">{errs.lastName}</p>}
                          </div>
                        </div>

                        {/* Display Name + Gender */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <Label className="text-xs">Display Name <span className="text-destructive">*</span></Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button type="button" className="text-muted-foreground hover:text-foreground">
                                    <CircleHelp className="h-3.5 w-3.5" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="text-xs">
                                  This name will be printed on your name badge.
                                </PopoverContent>
                              </Popover>
                            </div>
                            <Input
                              value={p.displayNameKo ?? ""}
                              onChange={(e) =>
                                updateParticipant(gi, pi, "displayNameKo", e.target.value)
                              }
                              placeholder="NAME ON BADGE"
                              className={errs.displayNameKo ? "border-destructive" : ""}
                            />
                            {errs.displayNameKo && <p className="text-xs text-destructive">{errs.displayNameKo}</p>}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <Label className="text-xs">Gender <span className="text-destructive">*</span></Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button type="button" className="text-muted-foreground hover:text-foreground">
                                    <Info className="h-3.5 w-3.5" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="text-xs">
                                  We collect gender information for administrative and accommodation purposes only. It is not used for eligibility, pricing, or discriminatory decisions. You may choose &quot;Prefer not to say&quot; if you are uncomfortable sharing.
                                </PopoverContent>
                              </Popover>
                            </div>
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
                                <SelectItem value="NON_BINARY">Non-binary</SelectItem>
                                <SelectItem value="PREFER_NOT_TO_SAY">Prefer not to say</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Birth Date */}
                        <BirthDatePicker
                          year={p.birthYear}
                          month={p.birthMonth}
                          day={p.birthDay}
                          labelClassName="text-xs"
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
                        {errs.birthYear && <p className="text-xs text-destructive">{errs.birthYear}</p>}

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
                            <Label className="text-xs">Grade <span className="text-destructive">*</span></Label>
                            <Select
                              value={p.grade ?? ""}
                              onValueChange={(v) =>
                                updateParticipant(gi, pi, "grade", v)
                              }
                            >
                              <SelectTrigger className={errs.grade ? "border-destructive" : ""}>
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
                            {errs.grade && <p className="text-xs text-destructive">{errs.grade}</p>}
                          </div>
                        )}

                        {/* Department */}
                        <div className="space-y-1">
                          <Label className="text-xs">Department <span className="text-destructive">*</span></Label>
                          <Select
                            value={p.departmentId ?? ""}
                            onValueChange={(v) =>
                              updateParticipant(gi, pi, "departmentId", v)
                            }
                          >
                            <SelectTrigger className={errs.departmentId ? "border-destructive" : ""}>
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
                          {errs.departmentId && <p className="text-xs text-destructive">{errs.departmentId}</p>}
                        </div>

                        {/* HANSAMO general lodging opt-in — only for Group 1 Representative */}
                        {gi === 0 && pi === 0 && isHansamoDept(p.departmentId) && (
                          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5">
                            <input
                              type="checkbox"
                              checked={hansamoGeneralLodging}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setHansamoGeneralLodging(checked);
                                if (checked) {
                                  // Switch to default registration group
                                  const defaultGroup = regGroups.find((g) => g.is_default);
                                  if (defaultGroup) {
                                    dispatch({ type: "SET_REGISTRATION_GROUP", groupId: defaultGroup.id });
                                  }
                                } else {
                                  // Switch back to HANSAMO department group
                                  const deptGroup = regGroups.find((g) => g.department_id === p.departmentId);
                                  if (deptGroup) {
                                    dispatch({ type: "SET_REGISTRATION_GROUP", groupId: deptGroup.id });
                                  }
                                }
                              }}
                              className="mt-0.5"
                            />
                            <Label className="text-xs font-normal leading-snug text-amber-900">
                              참여 부서는 한사모이지만, 한사모 지정 숙소가 아닌 가족/지인과 함께 등록하는 일반 숙소를 희망합니다.
                            </Label>
                          </div>
                        )}

                        {/* Email */}
                        <div className="space-y-1">
                          {!p.noEmail && (
                            <>
                              <Label className="text-xs">Email <span className="text-destructive">*</span></Label>
                              <Input
                                type="email"
                                value={p.email}
                                onChange={(e) =>
                                  updateParticipant(gi, pi, "email", e.target.value)
                                }
                                placeholder="email@example.com"
                                disabled={gi === 0 && pi === 0}
                                className={errs.email || (p.email && !isValidEmail(p.email)) ? "border-destructive" : ""}
                              />
                              {(errs.email || (p.email && !isValidEmail(p.email))) && (
                                <p className="text-xs text-destructive">{errs.email || "Enter a valid email"}</p>
                              )}
                            </>
                          )}
                          {!p.isRepresentative && (
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={p.noEmail ?? false}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  const updated = { ...p, noEmail: checked };
                                  if (checked) updated.email = "";
                                  dispatch({
                                    type: "UPDATE_PARTICIPANT",
                                    groupIndex: gi,
                                    participantIndex: pi,
                                    participant: updated,
                                  });
                                }}
                              />
                              <Label className="text-xs font-normal">I don&apos;t have an email address.</Label>
                            </div>
                          )}
                        </div>

                        {/* Phone */}
                        <div className="space-y-1">
                          {!p.noPhone && (
                            <>
                              <div className="flex items-center gap-1">
                                <Label className="text-xs">Phone <span className="text-destructive">*</span></Label>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button type="button" className="text-muted-foreground hover:text-foreground">
                                      <Info className="h-3.5 w-3.5" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="text-xs">
                                    By providing your number, you agree to receive service-related messages.
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <PhoneInput
                                value={p.phone}
                                countryCode={p.phoneCountry}
                                onChange={(v) => updateParticipant(gi, pi, "phone", v)}
                                onCountryChange={(c) => updateParticipant(gi, pi, "phoneCountry", c)}
                                error={!!errs.phone || isPhoneIncomplete(p.phone, p.phoneCountry)}
                              />
                              {(errs.phone || isPhoneIncomplete(p.phone, p.phoneCountry)) && (
                                <p className="text-xs text-destructive">{errs.phone || "Enter a complete phone number"}</p>
                              )}
                            </>
                          )}
                          {(!p.isRepresentative || (() => {
                            const birthDate = new Date(p.birthYear, p.birthMonth - 1, p.birthDay);
                            const refDate = eventDates
                              ? new Date(eventDates.eventStartDate + "T00:00:00")
                              : new Date(state.startDate + "T00:00:00");
                            return calculateAge(birthDate, refDate) < 18;
                          })()) && (
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={p.noPhone ?? false}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  const updated = { ...p, noPhone: checked };
                                  if (checked) updated.phone = "";
                                  dispatch({
                                    type: "UPDATE_PARTICIPANT",
                                    groupIndex: gi,
                                    participantIndex: pi,
                                    participant: updated,
                                  });
                                }}
                              />
                              <Label className="text-xs font-normal">I don&apos;t have a phone number.</Label>
                            </div>
                          )}
                        </div>

                        {/* Church */}
                        <div className="space-y-1">
                          <Label className="text-xs">Church <span className="text-destructive">*</span></Label>
                          <ChurchCombobox
                            churches={churches}
                            value={p.churchId ?? ""}
                            onValueChange={(v) =>
                              updateParticipant(gi, pi, "churchId", v)
                            }
                            error={!!errs.churchId}
                          />
                          {errs.churchId && <p className="text-xs text-destructive">{errs.churchId}</p>}
                        </div>
                        {isChurchOther(p.churchId) && (
                          <div className="space-y-1">
                            <Label className="text-xs">Church Name <span className="text-destructive">*</span></Label>
                            <Input
                              value={p.churchOther ?? ""}
                              onChange={(e) =>
                                updateParticipant(gi, pi, "churchOther", e.target.value)
                              }
                              placeholder="Enter your church name"
                              className={errs.churchOther ? "border-destructive" : ""}
                            />
                            {errs.churchOther && <p className="text-xs text-destructive">{errs.churchOther}</p>}
                          </div>
                        )}
                        {!isNoHomeChurch(p.churchId) && (
                          <div className="space-y-1">
                            <Label className="text-xs">Church Role <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                            <Select
                              value={p.churchRole ?? ""}
                              onValueChange={(v) =>
                                updateParticipant(gi, pi, "churchRole", v)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select your church role" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="MEMBER">Member</SelectItem>
                                <SelectItem value="DEACON">Deacon</SelectItem>
                                <SelectItem value="ELDER">Elder</SelectItem>
                                <SelectItem value="MINISTER">Minister</SelectItem>
                                <SelectItem value="PASTOR">Pastor</SelectItem>
                              </SelectContent>
                            </Select>
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

                        {/* Save & Continue */}
                        <Button
                          className="w-full mt-2"
                          onClick={() => saveParticipant(gi, pi)}
                          disabled={isSaving}
                        >
                          {isSaving
                            ? "Saving..."
                            : `Save ${p.firstName || "Participant"} & Continue`}
                        </Button>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
            {!isHansamoRestricted && !isOnlyOnePerson && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => addParticipant(gi)}
              >
                <Plus className="mr-1 size-4" />
                Add Participant
              </Button>
            )}
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-between pt-4">
        <Button
          variant="outline"
          onClick={() => router.push(`/register/${eventId}/instructions`)}
        >
          Back
        </Button>
        <Button onClick={handleNext}>Next: Lodging</Button>
      </div>

      {/* Remove participant confirmation dialog */}
      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Participant</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {removeTarget?.name} from the group?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removeTarget) {
                  removeParticipant(removeTarget.gi, removeTarget.pi);
                  setRemoveTarget(null);
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove group confirmation dialog */}
      <AlertDialog
        open={removeGroupTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveGroupTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Room Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove Room Group {removeGroupTarget !== null ? removeGroupTarget + 1 : ""}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removeGroupTarget !== null) {
                  removeGroup(removeGroupTarget);
                  setRemoveGroupTarget(null);
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
