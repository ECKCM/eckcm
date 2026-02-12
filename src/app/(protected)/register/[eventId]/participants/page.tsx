"use client";

import { useState, useEffect } from "react";
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
import { MAX_GROUPS, MAX_PARTICIPANTS_PER_GROUP } from "@/lib/utils/constants";
import { MealSelectionGrid } from "@/components/registration/meal-selection-grid";

const GENDERS: Gender[] = ["MALE", "FEMALE"];
const GRADES: Grade[] = [
  "PRE_K", "KINDERGARTEN",
  "GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4", "GRADE_5", "GRADE_6",
  "GRADE_7", "GRADE_8", "GRADE_9", "GRADE_10", "GRADE_11", "GRADE_12",
];

function createEmptyParticipant(isLeader: boolean): ParticipantInput {
  return {
    id: crypto.randomUUID(),
    isLeader,
    isExistingPerson: false,
    lastName: "",
    firstName: "",
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

  const [departments, setDepartments] = useState<
    { id: string; name_en: string; name_ko: string }[]
  >([]);
  const [churches, setChurches] = useState<
    { id: string; name_en: string; is_other: boolean }[]
  >([]);

  useEffect(() => {
    if (!state.startDate) {
      router.push(`/register/${eventId}`);
      return;
    }
    // Initialize with one group if empty
    if (state.roomGroups.length === 0) {
      dispatch({ type: "ADD_ROOM_GROUP", group: createEmptyGroup() });
    }
    // Load departments and churches
    const load = async () => {
      const supabase = createClient();
      const [{ data: deps }, { data: chs }] = await Promise.all([
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
      ]);
      setDepartments(deps ?? []);
      setChurches(chs ?? []);
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

    // Auto-detect K-12 based on age
    if (field === "birthYear") {
      const age =
        new Date(state.startDate).getFullYear() - (value as number);
      participant.isK12 = age < 18;
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

  const handleNext = () => {
    // Validate all groups have at least one participant with required fields
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
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Last Name *</Label>
                    <Input
                      value={p.lastName}
                      onChange={(e) =>
                        updateParticipant(gi, pi, "lastName", e.target.value)
                      }
                      placeholder="Kim"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">First Name *</Label>
                    <Input
                      value={p.firstName}
                      onChange={(e) =>
                        updateParticipant(gi, pi, "firstName", e.target.value)
                      }
                      placeholder="John"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Korean Name</Label>
                    <Input
                      value={p.displayNameKo ?? ""}
                      onChange={(e) =>
                        updateParticipant(gi, pi, "displayNameKo", e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Gender *</Label>
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
                        {GENDERS.map((g) => (
                          <SelectItem key={g} value={g}>
                            {g === "MALE" ? "Male" : "Female"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Birth Year *</Label>
                    <Input
                      type="number"
                      value={p.birthYear}
                      onChange={(e) =>
                        updateParticipant(
                          gi,
                          pi,
                          "birthYear",
                          parseInt(e.target.value)
                        )
                      }
                      min={1920}
                      max={new Date().getFullYear()}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Birth Month</Label>
                    <Select
                      value={p.birthMonth.toString()}
                      onValueChange={(v) =>
                        updateParticipant(gi, pi, "birthMonth", parseInt(v))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(
                          (m) => (
                            <SelectItem key={m} value={m.toString()}>
                              {m}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Birth Day</Label>
                    <Select
                      value={p.birthDay.toString()}
                      onValueChange={(v) =>
                        updateParticipant(gi, pi, "birthDay", parseInt(v))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(
                          (d) => (
                            <SelectItem key={d} value={d.toString()}>
                              {d}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone</Label>
                    <Input
                      value={p.phone}
                      onChange={(e) =>
                        updateParticipant(gi, pi, "phone", e.target.value)
                      }
                      placeholder="123-456-7890"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
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
                            {d.name_en} ({d.name_ko})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                        {churches.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name_en}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
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
                        {GRADES.map((g) => (
                          <SelectItem key={g} value={g}>
                            {g.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {/* Meal Selection */}
                {state.startDate && state.endDate && (
                  <MealSelectionGrid
                    startDate={state.startDate}
                    endDate={state.endDate}
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
