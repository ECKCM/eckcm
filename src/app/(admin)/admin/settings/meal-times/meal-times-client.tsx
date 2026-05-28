"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Coffee, Sun, Moon, Loader2 } from "lucide-react";
import {
  DEFAULT_MEAL_SCHEDULE,
  MEAL_KEYS,
  type MealKey,
  type MealSchedule,
} from "@/lib/meal-schedule";

const MEAL_ICONS: Record<MealKey, React.ReactNode> = {
  breakfast: <Coffee className="h-4 w-4" />,
  lunch: <Sun className="h-4 w-4" />,
  dinner: <Moon className="h-4 w-4" />,
};

const MEAL_LABELS: Record<MealKey, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

export function MealTimesClient() {
  const [schedule, setSchedule] = useState<MealSchedule>(DEFAULT_MEAL_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/app-config");
        if (res.ok) {
          const data = await res.json();
          if (data.meal_schedule) {
            setSchedule({
              breakfast: data.meal_schedule.breakfast ?? DEFAULT_MEAL_SCHEDULE.breakfast,
              lunch: data.meal_schedule.lunch ?? DEFAULT_MEAL_SCHEDULE.lunch,
              dinner: data.meal_schedule.dinner ?? DEFAULT_MEAL_SCHEDULE.dinner,
            });
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/app-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meal_schedule: schedule }),
      });
      if (res.ok) {
        toast.success("Meal times saved");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save");
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function updateMeal(key: MealKey, field: "start" | "end", value: string) {
    setSchedule((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Meal time windows</CardTitle>
          <CardDescription>
            The meal scanner uses these windows to suggest the right meal based
            on the current time. End times must be after start times.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {MEAL_KEYS.map((key) => (
            <div key={key} className="grid grid-cols-1 sm:grid-cols-[160px_1fr_1fr] gap-3 items-end">
              <div className="flex items-center gap-2 font-medium">
                {MEAL_ICONS[key]} {MEAL_LABELS[key]}
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${key}-start`} className="text-xs">
                  Start
                </Label>
                <Input
                  id={`${key}-start`}
                  type="time"
                  value={schedule[key].start}
                  onChange={(e) => updateMeal(key, "start", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${key}-end`} className="text-xs">
                  End
                </Label>
                <Input
                  id={`${key}-end`}
                  type="time"
                  value={schedule[key].end}
                  onChange={(e) => updateMeal(key, "end", e.target.value)}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  );
}
