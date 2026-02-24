"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
  event_start_date: string;
  event_end_date: string;
}

export function NewSessionForm({ events }: { events: EventOption[] }) {
  const router = useRouter();
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");
  const [nameEn, setNameEn] = useState("");
  const [nameKo, setNameKo] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEventId || !nameEn || !sessionDate) {
      toast.error("Please fill in all required fields");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("eckcm_sessions").insert({
      event_id: selectedEventId,
      name_en: nameEn,
      name_ko: nameKo || null,
      session_date: sessionDate,
      start_time: startTime || null,
      end_time: endTime || null,
      is_active: true,
    });

    setSaving(false);

    if (error) {
      toast.error("Failed to create session");
      return;
    }

    toast.success("Session created");
    router.push("/admin/checkin/session");
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link href="/admin/checkin/session">
        <Button variant="ghost" size="sm" className="mb-4 gap-1">
          <ArrowLeft className="h-4 w-4" />
          Back to Sessions
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New Session</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Event *</Label>
              <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select event" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name_en} ({e.year})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name_en">Session Name (EN) *</Label>
              <Input
                id="name_en"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g., Morning Worship"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name_ko">Session Name (KO)</Label>
              <Input
                id="name_ko"
                value={nameKo}
                onChange={(e) => setNameKo(e.target.value)}
                placeholder="e.g., 아침 예배"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="session_date">Date *</Label>
              <Input
                id="session_date"
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="start_time">Start Time</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_time">End Time</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Session
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
