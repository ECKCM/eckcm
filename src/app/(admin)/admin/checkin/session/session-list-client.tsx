"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, QrCode, Calendar } from "lucide-react";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
}

interface Session {
  id: string;
  name_en: string;
  name_ko: string | null;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  is_active: boolean;
}

export function SessionListClient({
  events,
  initialSessions,
}: {
  events: EventOption[];
  initialSessions: Session[];
}) {
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");
  const [sessions, setSessions] = useState<Session[]>(initialSessions);

  useEffect(() => {
    if (!selectedEventId || selectedEventId === events[0]?.id) return;
    const supabase = createClient();
    supabase
      .from("eckcm_sessions")
      .select("id, name_en, name_ko, session_date, start_time, end_time, is_active")
      .eq("event_id", selectedEventId)
      .order("session_date", { ascending: true })
      .then(({ data }) => setSessions(data ?? []));
  }, [selectedEventId, events]);

  const activeSessions = sessions.filter((s) => s.is_active);
  const inactiveSessions = sessions.filter((s) => !s.is_active);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Select value={selectedEventId} onValueChange={setSelectedEventId}>
          <SelectTrigger className="w-[260px]">
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

        <Link href="/admin/checkin/session/new">
          <Button className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Session
          </Button>
        </Link>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <Calendar className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No sessions found for this event.</p>
            <p className="text-sm mt-1">
              Create sessions in{" "}
              <Link href="/admin/settings/sessions" className="underline">
                Settings &gt; Sessions
              </Link>{" "}
              first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sessions</CardTitle>
            <CardDescription>
              {activeSessions.length} active, {inactiveSessions.length} inactive
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="font-medium">
                      {session.name_en}
                      {session.name_ko && (
                        <span className="text-muted-foreground ml-1 text-sm">
                          ({session.name_ko})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{session.session_date}</TableCell>
                    <TableCell>
                      {session.start_time && session.end_time
                        ? `${session.start_time} - ${session.end_time}`
                        : session.start_time || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={session.is_active ? "default" : "secondary"}>
                        {session.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/admin/checkin/session/${session.id}`}>
                        <Button variant="outline" size="sm" className="gap-1">
                          <QrCode className="h-3.5 w-3.5" />
                          Dashboard
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
