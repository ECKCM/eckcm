"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, Plus, X } from "lucide-react";

interface MealRule {
  id: string;
  event_id: string;
  meal_start_date: string;
  meal_end_date: string;
  no_meal_dates: string[];
  adult_price_each_cents: number;
  youth_price_each_cents: number;
  adult_price_day_cents: number;
  youth_price_day_cents: number;
  free_under_age: number;
}

interface EventOption {
  id: string;
  name_en: string;
  event_start_date: string;
  event_end_date: string;
}

const defaultForm = {
  meal_start_date: "",
  meal_end_date: "",
  no_meal_dates: [] as string[],
  adult_price_each_cents: 1800,
  youth_price_each_cents: 1000,
  adult_price_day_cents: 4500,
  youth_price_day_cents: 2500,
  free_under_age: 4,
};

export function MealRulesManager() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [rule, setRule] = useState<MealRule | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newNoMealDate, setNewNoMealDate] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("eckcm_events")
        .select("id, name_en, event_start_date, event_end_date")
        .eq("is_active", true)
        .order("year", { ascending: false });
      setEvents(data ?? []);
      if (data && data.length > 0) {
        setSelectedEventId(data[0].id);
      }
      setLoading(false);
    })();
  }, []);

  const loadRule = useCallback(async () => {
    if (!selectedEventId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_meal_rules")
      .select("*")
      .eq("event_id", selectedEventId)
      .maybeSingle();

    if (data) {
      setRule(data);
      setForm({
        meal_start_date: data.meal_start_date,
        meal_end_date: data.meal_end_date,
        no_meal_dates: data.no_meal_dates ?? [],
        adult_price_each_cents: data.adult_price_each_cents,
        youth_price_each_cents: data.youth_price_each_cents,
        adult_price_day_cents: data.adult_price_day_cents,
        youth_price_day_cents: data.youth_price_day_cents,
        free_under_age: data.free_under_age,
      });
    } else {
      setRule(null);
      const event = events.find((e) => e.id === selectedEventId);
      setForm({
        ...defaultForm,
        meal_start_date: event?.event_start_date ?? "",
        meal_end_date: event?.event_end_date ?? "",
      });
    }
  }, [selectedEventId, events]);

  useEffect(() => {
    loadRule();
  }, [loadRule]);

  const handleSave = async () => {
    if (!form.meal_start_date || !form.meal_end_date) {
      toast.error("Meal start and end dates are required");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const payload = {
      event_id: selectedEventId,
      meal_start_date: form.meal_start_date,
      meal_end_date: form.meal_end_date,
      no_meal_dates: form.no_meal_dates,
      adult_price_each_cents: form.adult_price_each_cents,
      youth_price_each_cents: form.youth_price_each_cents,
      adult_price_day_cents: form.adult_price_day_cents,
      youth_price_day_cents: form.youth_price_day_cents,
      free_under_age: form.free_under_age,
    };

    if (rule) {
      const { error } = await supabase
        .from("eckcm_meal_rules")
        .update(payload)
        .eq("id", rule.id);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Meal rules updated");
    } else {
      const { error } = await supabase
        .from("eckcm_meal_rules")
        .insert(payload);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Meal rules created");
    }

    setSaving(false);
    loadRule();
  };

  const addNoMealDate = () => {
    if (!newNoMealDate) return;
    if (form.no_meal_dates.includes(newNoMealDate)) {
      toast.error("Date already added");
      return;
    }
    setForm({ ...form, no_meal_dates: [...form.no_meal_dates, newNoMealDate].sort() });
    setNewNoMealDate("");
  };

  const removeNoMealDate = (date: string) => {
    setForm({
      ...form,
      no_meal_dates: form.no_meal_dates.filter((d) => d !== date),
    });
  };

  const centsToStr = (cents: number) => (cents / 100).toFixed(2);
  const strToCents = (str: string) => Math.round(parseFloat(str || "0") * 100);

  if (loading) {
    return <p className="text-center text-muted-foreground py-8">Loading...</p>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Configure meal pricing and date rules for each event. These settings are used
        in the registration wizard and pricing calculations.
      </p>

      <Select value={selectedEventId} onValueChange={setSelectedEventId}>
        <SelectTrigger className="w-[280px]">
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

      {selectedEventId && (
        <>
          {/* Meal Dates */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Meal Dates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>First Meal Date</Label>
                  <Input
                    type="date"
                    value={form.meal_start_date}
                    onChange={(e) => setForm({ ...form, meal_start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Last Meal Date</Label>
                  <Input
                    type="date"
                    value={form.meal_end_date}
                    onChange={(e) => setForm({ ...form, meal_end_date: e.target.value })}
                  />
                </div>
              </div>

              {/* No-meal dates */}
              <div className="space-y-2">
                <Label>No-Meal Dates (meals not served)</Label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={newNoMealDate}
                    onChange={(e) => setNewNoMealDate(e.target.value)}
                    className="max-w-[200px]"
                  />
                  <Button variant="outline" size="sm" onClick={addNoMealDate}>
                    <Plus className="mr-1 size-4" />
                    Add
                  </Button>
                </div>
                {form.no_meal_dates.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {form.no_meal_dates.map((date) => (
                      <Badge key={date} variant="secondary" className="gap-1">
                        {date}
                        <button onClick={() => removeNoMealDate(date)}>
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Adult - Per Meal ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={centsToStr(form.adult_price_each_cents)}
                    onChange={(e) =>
                      setForm({ ...form, adult_price_each_cents: strToCents(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Youth - Per Meal ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={centsToStr(form.youth_price_each_cents)}
                    onChange={(e) =>
                      setForm({ ...form, youth_price_each_cents: strToCents(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Adult - Full Day ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={centsToStr(form.adult_price_day_cents)}
                    onChange={(e) =>
                      setForm({ ...form, adult_price_day_cents: strToCents(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Youth - Full Day ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={centsToStr(form.youth_price_day_cents)}
                    onChange={(e) =>
                      setForm({ ...form, youth_price_day_cents: strToCents(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1 max-w-[200px]">
                <Label>Free Under Age (inclusive)</Label>
                <Input
                  type="number"
                  min="0"
                  max="18"
                  value={form.free_under_age}
                  onChange={(e) =>
                    setForm({ ...form, free_under_age: parseInt(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Children aged {form.free_under_age} and under eat free
                </p>
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 size-4" />
            {saving ? "Saving..." : rule ? "Update Rules" : "Create Rules"}
          </Button>
        </>
      )}
    </div>
  );
}
