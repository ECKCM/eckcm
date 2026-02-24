"use client";

import { useState } from "react";
import { CheckinScanner } from "../checkin-scanner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone } from "lucide-react";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
}

export function SelfCheckinClient({ events }: { events: EventOption[] }) {
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");

  if (!selectedEventId) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No active events available for check-in.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4" />
            Self Check-in
          </CardTitle>
          <CardDescription>
            Use your device camera to scan your E-Pass QR code
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {events.length > 1 && (
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
          )}
        </CardContent>
      </Card>

      <CheckinScanner events={events} />
    </div>
  );
}
