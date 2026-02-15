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
import { Plus, Trash2, ChevronDown, CheckCircle2 } from "lucide-react";
import type { ParticipantInput, RoomGroupInput, MealSelection } from "@/lib/types/registration";
import type { Gender, Grade } from "@/lib/types/database";
import { MAX_GROUPS, MAX_PARTICIPANTS_PER_GROUP, GRADE_LABELS } from "@/lib/utils/constants";
import { calculateAge } from "@/lib/utils/validators";
import {
  filterName,
  buildDisplayName,
  isPhoneIncomplete,
  buildPhoneValue,
  isValidEmail,
  NAME_PATTERN,
} from "@/lib/utils/field-helpers";
import { PhoneInput } from "@/components/shared/phone-input";
import { ChurchCombobox } from "@/components/shared/church-combobox";
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
  const leaderFilledRef = useRef(false);
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

  // Track which participants are open (accordion state)
  // Key: "gi-pi", value: open/closed
  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>({
    "0-0": true, // First leader starts open
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

  // HANSAMO policy: leader-only registration unless general lodging opted
  const [hansamoGeneralLodging, setHansamoGeneralLodging] = useState(false);

  const isHansamoDept = (deptId: string | undefined) => {
    if (!deptId) return false;
    return departments.find((d) => d.id === deptId)?.name_en?.includes("HANSAMO") ?? false;
  };

  // True when Group 1 Leader selected HANSAMO and did NOT opt for general lodging
  const leaderDeptId = state.roomGroups[0]?.participants[0]?.departmentId;
  const isHansamoRestricted = isHansamoDept(leaderDeptId) && !hansamoGeneralLodging;

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
                phoneCountry: person.phone_country ?? "US",
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
    const newGroup = createEmptyGroup();
    dispatch({ type: "ADD_ROOM_GROUP", group: newGroup });
    // Open the new group's leader
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
  const validateParticipant = (p: ParticipantInput): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!p.firstName.trim()) errs.firstName = "Required";
    else if (!NAME_PATTERN.test(p.firstName.trim())) errs.firstName = "Uppercase letters only";
    if (!p.lastName.trim()) errs.lastName = "Required";
    else if (!NAME_PATTERN.test(p.lastName.trim())) errs.lastName = "Uppercase letters only";
    if (!p.displayNameKo?.trim()) errs.displayNameKo = "Required";
    if (!p.departmentId) errs.departmentId = "Required";
    if (!p.email) errs.email = "Required";
    else if (!isValidEmail(p.email)) errs.email = "Enter a valid email";
    if (!p.phone.trim()) errs.phone = "Required";
    else if (isPhoneIncomplete(p.phone, p.phoneCountry)) errs.phone = "Enter a complete phone number";
    if (!p.churchId) errs.churchId = "Required";
    if (isChurchOther(p.churchId) && !p.churchOther?.trim()) errs.churchOther = "Required";
    return errs;
  };

  // Save participant to draft DB
  const saveParticipant = async (gi: number, pi: number) => {
    const p = state.roomGroups[gi].participants[pi];
    const key = `${gi}-${pi}`;

    // Validate — show inline errors
    const errs = validateParticipant(p);
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

    setSavingPanel(key);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Not authenticated");
      setSavingPanel(null);
      return;
    }

    const { error: dbError } = await supabase
      .from("eckcm_registration_drafts")
      .upsert({
        user_id: user.id,
        event_id: eventId,
        participant_client_id: p.id,
        group_index: gi,
        participant_index: pi,
        is_leader: p.isLeader,
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
    dispatch({ type: "SET_STEP", step: 3 });
    router.push(`/register/${eventId}/lodging`);
  };

  return (
    <div className="mx-auto max-w-3xl p-4 pt-8 space-y-6">
      <WizardStepper currentStep={2} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Room Groups & Participants</h2>
        {!isHansamoRestricted && (
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
              <CardTitle className="text-base">Room Group {gi + 1}</CardTitle>
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
                          {p.isLeader ? "Leader" : `Member ${pi}`}
                          {(p.firstName || p.lastName) && (
                            <span className="ml-2 font-normal text-muted-foreground">
                              {p.firstName} {p.lastName}
                            </span>
                          )}
                        </span>
                        {!p.isLeader && (
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
                            <Label className="text-xs">First Name (EN) <span className="text-destructive">*</span></Label>
                            <Input
                              value={p.firstName}
                              onChange={(e) =>
                                handleNameChange(gi, pi, "firstName", e.target.value)
                              }
                              placeholder="JOHN"
                              className={errs.firstName ? "border-destructive" : ""}
                            />
                            {errs.firstName && <p className="text-xs text-destructive">{errs.firstName}</p>}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Last Name (EN) <span className="text-destructive">*</span></Label>
                            <Input
                              value={p.lastName}
                              onChange={(e) =>
                                handleNameChange(gi, pi, "lastName", e.target.value)
                              }
                              placeholder="KIM"
                              className={errs.lastName ? "border-destructive" : ""}
                            />
                            {errs.lastName && <p className="text-xs text-destructive">{errs.lastName}</p>}
                          </div>
                        </div>

                        {/* Display Name + Gender */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Display Name <span className="text-destructive">*</span></Label>
                            <Input
                              value={p.displayNameKo ?? ""}
                              onChange={(e) =>
                                updateParticipant(gi, pi, "displayNameKo", e.target.value)
                              }
                              placeholder="Scott Kim"
                              className={errs.displayNameKo ? "border-destructive" : ""}
                            />
                            {errs.displayNameKo && <p className="text-xs text-destructive">{errs.displayNameKo}</p>}
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

                        {/* HANSAMO general lodging opt-in — only for Group 1 Leader */}
                        {gi === 0 && pi === 0 && isHansamoDept(p.departmentId) && (
                          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5">
                            <input
                              type="checkbox"
                              checked={hansamoGeneralLodging}
                              onChange={(e) => setHansamoGeneralLodging(e.target.checked)}
                              className="mt-0.5"
                            />
                            <Label className="text-xs font-normal leading-snug text-amber-900">
                              참여 부서는 한사모이지만, 한사모 지정 숙소가 아닌 가족/지인과 함께 등록하는 일반 숙소를 희망합니다.
                            </Label>
                          </div>
                        )}

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
                            className={errs.email || (p.email && !isValidEmail(p.email)) ? "border-destructive" : ""}
                          />
                          {(errs.email || (p.email && !isValidEmail(p.email))) && (
                            <p className="text-xs text-destructive">{errs.email || "Enter a valid email"}</p>
                          )}
                        </div>

                        {/* Phone */}
                        <div className="space-y-1">
                          <Label className="text-xs">Phone <span className="text-destructive">*</span></Label>
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
            {!isHansamoRestricted && (
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
          onClick={() => router.push(`/register/${eventId}`)}
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
