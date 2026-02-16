"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface EventDetailFormProps {
  event: {
    id: string;
    name_en: string;
    name_ko: string | null;
    year: number;
    event_start_date: string;
    event_end_date: string;
    registration_start_date: string | null;
    registration_end_date: string | null;
    location: string | null;
    is_active: boolean;
  };
}

// Convert timestamptz string to datetime-local format (YYYY-MM-DDTHH:mm)
function toDatetimeLocal(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventDetailForm({ event }: EventDetailFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name_en: event.name_en,
    name_ko: event.name_ko ?? "",
    year: event.year,
    event_start_date: event.event_start_date,
    event_end_date: event.event_end_date,
    registration_start_date: toDatetimeLocal(event.registration_start_date),
    registration_end_date: toDatetimeLocal(event.registration_end_date),
    location: event.location ?? "",
    is_active: event.is_active,
  });

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("eckcm_events")
      .update({
        name_en: form.name_en,
        name_ko: form.name_ko || null,
        year: form.year,
        event_start_date: form.event_start_date,
        event_end_date: form.event_end_date,
        registration_start_date: form.registration_start_date || null,
        registration_end_date: form.registration_end_date || null,
        location: form.location || null,
        is_active: form.is_active,
      })
      .eq("id", event.id);

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Event updated");
    router.refresh();
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Event Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Name (English)</Label>
            <Input
              value={form.name_en}
              onChange={(e) => setForm({ ...form, name_en: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Name (Korean)</Label>
            <Input
              value={form.name_ko}
              onChange={(e) => setForm({ ...form, name_ko: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Year</Label>
            <Input
              type="number"
              value={form.year}
              onChange={(e) =>
                setForm({ ...form, year: parseInt(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Event Start</Label>
            <Input
              type="date"
              value={form.event_start_date}
              onChange={(e) =>
                setForm({ ...form, event_start_date: e.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Event End</Label>
            <Input
              type="date"
              value={form.event_end_date}
              onChange={(e) =>
                setForm({ ...form, event_end_date: e.target.value })
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Registration Opens</Label>
            <Input
              type="datetime-local"
              value={form.registration_start_date}
              onChange={(e) =>
                setForm({ ...form, registration_start_date: e.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Registration Closes</Label>
            <Input
              type="datetime-local"
              value={form.registration_end_date}
              onChange={(e) =>
                setForm({ ...form, registration_end_date: e.target.value })
              }
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Location</Label>
          <Input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </div>

        <div className="flex items-center gap-3">
          <Switch
            checked={form.is_active}
            onCheckedChange={(checked) =>
              setForm({ ...form, is_active: checked })
            }
          />
          <Label>Active</Label>
        </div>

        <div className="flex gap-3 pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
          <Button variant="outline" onClick={() => router.push("/admin/events")}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
