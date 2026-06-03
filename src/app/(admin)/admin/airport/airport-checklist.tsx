"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  PlaneLanding,
  PlaneTakeoff,
  Users,
  Plane,
  MessageSquare,
  Pencil,
  Trash2,
  X,
  Check,
} from "lucide-react";

interface EventOption {
  id: string;
  name_en: string;
}

interface RideWithPassengers {
  id: string;
  direction: "PICKUP" | "DROPOFF";
  scheduled_at: string;
  label: string | null;
  origin: string | null;
  destination: string | null;
  is_active: boolean;
  passengers: Passenger[];
}

interface Passenger {
  /** Unique key: registrationRideId + memberIndex */
  id: string;
  registrationRideId: string;
  /** eckcm_people.id — null for placeholder rows where members couldn't be resolved */
  personId: string | null;
  flightInfo: string | null;
  confirmationCode: string | null;
  name: string;
  phone: string | null;
  gender: string | null;
  ageAtEvent: number | null;
  participantCode: string | null;
  role: string | null;
}

interface AirportNote {
  id: string;
  rideId: string;
  personId: string;
  body: string;
  authorId: string | null;
  authorEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Build the map key for notes lookup. */
function noteKey(rideId: string, personId: string) {
  return `${rideId}:${personId}`;
}

export function AirportChecklist() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [rides, setRides] = useState<RideWithPassengers[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  /** Map of `${rideId}:${personId}` → notes (newest first) */
  const [notesByKey, setNotesByKey] = useState<Map<string, AirportNote[]>>(
    new Map()
  );

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [{ data: eventData }, { data: userData }] = await Promise.all([
        supabase
          .from("eckcm_events")
          .select("id, name_en")
          .eq("is_active", true)
          .order("is_default", { ascending: false })
          .order("year", { ascending: false }),
        supabase.auth.getUser(),
      ]);
      setEvents(eventData ?? []);
      if (eventData && eventData.length > 0) {
        setSelectedEventId(eventData[0].id);
      }
      setCurrentUserId(userData.user?.id ?? null);
      setLoading(false);
    })();
  }, []);

  const loadRides = useCallback(async () => {
    if (!selectedEventId) return;
    setLoading(true);
    const supabase = createClient();

    // Fetch rides for this event
    const { data: rideRows } = await supabase
      .from("eckcm_airport_rides")
      .select("id, direction, scheduled_at, label, origin, destination, is_active")
      .eq("event_id", selectedEventId)
      .order("scheduled_at");

    if (!rideRows) {
      setRides([]);
      setLoading(false);
      return;
    }

    // Fetch registration rides — now one row per PASSENGER (person_id). Pull the
    // person directly, plus the registration's memberships to resolve each
    // person's participant_code / role.
    const rideIds = rideRows.map((r) => r.id);
    const { data: regRides } = await supabase
      .from("eckcm_registration_rides")
      .select(
        `id, ride_id, person_id, flight_info,
         eckcm_people!inner(id, first_name_en, last_name_en, phone, gender, age_at_event),
         eckcm_registrations!inner(
           confirmation_code, status,
           eckcm_groups(
             eckcm_group_memberships(participant_code, role, person_id)
           )
         )`
      )
      .in("ride_id", rideIds);

    // Build ride map — each registration_ride row is a single passenger.
    const ridesWithPassengers: RideWithPassengers[] = rideRows.map((ride) => {
      const passengers: Passenger[] = [];

      if (regRides) {
        for (const rr of regRides as any[]) {
          if (rr.ride_id !== ride.id) continue;
          const reg = rr.eckcm_registrations;
          if (!reg || reg.status === "CANCELLED" || reg.status === "DRAFT") continue;
          const person = rr.eckcm_people;
          if (!person) continue;

          // Find this person's membership in the registration for code/role.
          let participantCode: string | null = null;
          let role: string | null = null;
          const groups = reg.eckcm_groups;
          if (Array.isArray(groups)) {
            for (const g of groups) {
              const members = g.eckcm_group_memberships;
              if (Array.isArray(members)) {
                const m = members.find((mm: any) => mm.person_id === rr.person_id);
                if (m) {
                  participantCode = m.participant_code ?? null;
                  role = m.role ?? null;
                  break;
                }
              }
            }
          }

          passengers.push({
            id: rr.id,
            registrationRideId: rr.id,
            personId: rr.person_id ?? person.id ?? null,
            flightInfo: rr.flight_info,
            confirmationCode: reg.confirmation_code,
            name: `${person.first_name_en} ${person.last_name_en}`,
            phone: person.phone ?? null,
            gender: person.gender ?? null,
            ageAtEvent: person.age_at_event ?? null,
            participantCode,
            role,
          });
        }
      }

      // Stable display order by name.
      passengers.sort((a, b) => a.name.localeCompare(b.name));

      return { ...ride, passengers };
    });

    setRides(ridesWithPassengers);
    setLoading(false);

    // Fetch notes for all (ride, person) pairs in view
    const personIds = new Set<string>();
    for (const r of ridesWithPassengers) {
      for (const p of r.passengers) {
        if (p.personId) personIds.add(p.personId);
      }
    }
    if (rideIds.length === 0 || personIds.size === 0) {
      setNotesByKey(new Map());
      return;
    }
    const { data: noteRows } = await supabase
      .from("eckcm_airport_notes")
      .select(
        "id, ride_id, person_id, body, author_id, created_at, updated_at, eckcm_users:author_id(email)"
      )
      .in("ride_id", rideIds)
      .in("person_id", [...personIds])
      .order("created_at", { ascending: false });

    const map = new Map<string, AirportNote[]>();
    for (const n of noteRows ?? []) {
      const row = n as unknown as {
        id: string;
        ride_id: string;
        person_id: string;
        body: string;
        author_id: string | null;
        created_at: string;
        updated_at: string;
        eckcm_users: { email: string | null } | null;
      };
      const key = noteKey(row.ride_id, row.person_id);
      const note: AirportNote = {
        id: row.id,
        rideId: row.ride_id,
        personId: row.person_id,
        body: row.body,
        authorId: row.author_id,
        authorEmail: row.eckcm_users?.email ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      const existing = map.get(key);
      if (existing) existing.push(note);
      else map.set(key, [note]);
    }
    setNotesByKey(map);
  }, [selectedEventId]);

  useEffect(() => {
    loadRides();
  }, [loadRides]);

  const addNote = useCallback(
    async (rideId: string, personId: string, body: string) => {
      if (!currentUserId) {
        toast.error("Not signed in");
        return false;
      }
      const trimmed = body.trim();
      if (!trimmed) return false;
      const supabase = createClient();
      const { data, error } = await supabase
        .from("eckcm_airport_notes")
        .insert({
          ride_id: rideId,
          person_id: personId,
          body: trimmed,
          author_id: currentUserId,
        })
        .select(
          "id, ride_id, person_id, body, author_id, created_at, updated_at, eckcm_users:author_id(email)"
        )
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Failed to add note");
        return false;
      }
      const row = data as unknown as {
        id: string;
        ride_id: string;
        person_id: string;
        body: string;
        author_id: string | null;
        created_at: string;
        updated_at: string;
        eckcm_users: { email: string | null } | null;
      };
      const note: AirportNote = {
        id: row.id,
        rideId: row.ride_id,
        personId: row.person_id,
        body: row.body,
        authorId: row.author_id,
        authorEmail: row.eckcm_users?.email ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      setNotesByKey((prev) => {
        const next = new Map(prev);
        const key = noteKey(rideId, personId);
        next.set(key, [note, ...(next.get(key) ?? [])]);
        return next;
      });
      return true;
    },
    [currentUserId]
  );

  const updateNote = useCallback(
    async (noteId: string, rideId: string, personId: string, body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return false;
      const supabase = createClient();
      const { data, error } = await supabase
        .from("eckcm_airport_notes")
        .update({ body: trimmed })
        .eq("id", noteId)
        .select("id, updated_at")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Failed to update note");
        return false;
      }
      setNotesByKey((prev) => {
        const next = new Map(prev);
        const key = noteKey(rideId, personId);
        const list = next.get(key);
        if (list) {
          next.set(
            key,
            list.map((n) =>
              n.id === noteId
                ? { ...n, body: trimmed, updatedAt: data.updated_at }
                : n
            )
          );
        }
        return next;
      });
      return true;
    },
    []
  );

  const deleteNote = useCallback(
    async (noteId: string, rideId: string, personId: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("eckcm_airport_notes")
        .delete()
        .eq("id", noteId);
      if (error) {
        toast.error(error.message);
        return false;
      }
      setNotesByKey((prev) => {
        const next = new Map(prev);
        const key = noteKey(rideId, personId);
        const list = next.get(key);
        if (list) {
          next.set(
            key,
            list.filter((n) => n.id !== noteId)
          );
        }
        return next;
      });
      return true;
    },
    []
  );

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatDateTime = (iso: string) => {
    const dt = new Date(iso);
    return dt.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/New_York",
    });
  };

  // Filter rides by search query (matches passenger name, phone, confirmation code, flight info)
  const filterRides = useMemo(() => {
    if (!searchQuery.trim()) return rides;
    const q = searchQuery.toLowerCase();
    return rides
      .map((ride) => ({
        ...ride,
        passengers: ride.passengers.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.phone?.toLowerCase().includes(q) ||
            p.confirmationCode?.toLowerCase().includes(q) ||
            p.participantCode?.toLowerCase().includes(q) ||
            p.flightInfo?.toLowerCase().includes(q)
        ),
      }))
      .filter((ride) => ride.passengers.length > 0);
  }, [rides, searchQuery]);

  const pickups = filterRides.filter((r) => r.direction === "PICKUP");
  const dropoffs = filterRides.filter((r) => r.direction === "DROPOFF");

  const pickupPassengerCount = pickups.reduce(
    (sum, r) => sum + r.passengers.length,
    0
  );
  const dropoffPassengerCount = dropoffs.reduce(
    (sum, r) => sum + r.passengers.length,
    0
  );

  if (loading && !rides.length) {
    return (
      <p className="text-center text-muted-foreground py-8">Loading...</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
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

        <SearchInput
          placeholder="Search name, phone, code, flight..."
          value={searchQuery}
          onValueChange={setSearchQuery}
          containerClassName="flex-1 min-w-[200px] max-w-sm"
        />
      </div>

      {rides.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Plane className="size-10 mb-3 opacity-40" />
          <p>No airport rides configured for this event.</p>
        </div>
      ) : (
        <Tabs defaultValue="pickup">
          <TabsList>
            <TabsTrigger value="pickup" className="gap-2">
              <PlaneLanding className="size-4" />
              Pickup
              <Badge variant="secondary" className="ml-1 text-xs">
                {pickupPassengerCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="dropoff" className="gap-2">
              <PlaneTakeoff className="size-4" />
              Drop-off
              <Badge variant="secondary" className="ml-1 text-xs">
                {dropoffPassengerCount}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pickup" className="space-y-4 mt-4">
            {pickups.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {searchQuery ? "No matching passengers found." : "No pickup rides configured."}
              </p>
            ) : (
              pickups.map((ride) => (
                <RideCard
                  key={ride.id}
                  ride={ride}
                  checked={checked}
                  onToggleCheck={toggleCheck}
                  formatDateTime={formatDateTime}
                  notesByKey={notesByKey}
                  currentUserId={currentUserId}
                  onAddNote={addNote}
                  onUpdateNote={updateNote}
                  onDeleteNote={deleteNote}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="dropoff" className="space-y-4 mt-4">
            {dropoffs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {searchQuery ? "No matching passengers found." : "No drop-off rides configured."}
              </p>
            ) : (
              dropoffs.map((ride) => (
                <RideCard
                  key={ride.id}
                  ride={ride}
                  checked={checked}
                  onToggleCheck={toggleCheck}
                  formatDateTime={formatDateTime}
                  notesByKey={notesByKey}
                  currentUserId={currentUserId}
                  onAddNote={addNote}
                  onUpdateNote={updateNote}
                  onDeleteNote={deleteNote}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function RideCard({
  ride,
  checked,
  onToggleCheck,
  formatDateTime,
  notesByKey,
  currentUserId,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
}: {
  ride: RideWithPassengers;
  checked: Set<string>;
  onToggleCheck: (id: string) => void;
  formatDateTime: (iso: string) => string;
  notesByKey: Map<string, AirportNote[]>;
  currentUserId: string | null;
  onAddNote: (rideId: string, personId: string, body: string) => Promise<boolean>;
  onUpdateNote: (
    noteId: string,
    rideId: string,
    personId: string,
    body: string
  ) => Promise<boolean>;
  onDeleteNote: (noteId: string, rideId: string, personId: string) => Promise<boolean>;
}) {
  const totalPassengers = ride.passengers.length;
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  const toggleNotes = (passengerId: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(passengerId)) next.delete(passengerId);
      else next.add(passengerId);
      return next;
    });
  };

  return (
    <Card className={!ride.is_active ? "opacity-50" : ""}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={ride.direction === "PICKUP" ? "default" : "secondary"}
            >
              {ride.direction === "PICKUP" ? "Pickup" : "Drop-off"}
            </Badge>
            <CardTitle className="text-base">
              {formatDateTime(ride.scheduled_at)}
            </CardTitle>
            {(ride.origin || ride.destination) && (
              <span className="text-sm text-muted-foreground">
                {ride.origin ?? "—"} → {ride.destination ?? "—"}
              </span>
            )}
            {ride.label && (
              <span className="text-sm text-muted-foreground">
                {ride.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
            <Users className="size-4" />
            <span>
              {totalPassengers} person{totalPassengers !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {ride.passengers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No one has signed up for this ride yet.
          </p>
        ) : (
          <div className="space-y-2">
            {ride.passengers.map((p) => {
              const noteList = p.personId
                ? notesByKey.get(noteKey(ride.id, p.personId)) ?? []
                : [];
              const isOpen = expandedNotes.has(p.id);
              return (
                <div
                  key={p.id}
                  className={`rounded-md border transition-all ${
                    checked.has(p.id)
                      ? "bg-muted/50 border-primary/30"
                      : "hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-start gap-3 p-3">
                    <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
                      <Checkbox
                        checked={checked.has(p.id)}
                        onCheckedChange={() => onToggleCheck(p.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`font-medium text-sm ${
                              checked.has(p.id)
                                ? "line-through text-muted-foreground"
                                : ""
                            }`}
                          >
                            {p.name}
                          </span>
                          {p.gender && (
                            <Badge variant="outline" className={`text-xs ${p.gender === "MALE" ? "border-blue-300 bg-blue-50 text-blue-700" : p.gender === "FEMALE" ? "border-pink-300 bg-pink-50 text-pink-700" : ""}`}>
                              {p.gender === "MALE" ? "M" : p.gender === "FEMALE" ? "F" : p.gender}
                            </Badge>
                          )}
                          {p.ageAtEvent != null && (
                            <span className="text-xs text-muted-foreground">
                              Age {p.ageAtEvent}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          {p.phone && <a href={`tel:${p.phone}`} onClick={(e) => e.stopPropagation()} className="underline hover:text-foreground">{p.phone}</a>}
                          {p.participantCode && (
                            <span className="font-mono">{p.participantCode}</span>
                          )}
                          {p.confirmationCode && (
                            <span className="font-mono">{p.confirmationCode}</span>
                          )}
                        </div>
                        {p.flightInfo && (
                          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                            {p.flightInfo}
                          </p>
                        )}
                      </div>
                    </label>
                    {p.personId && (
                      <Button
                        type="button"
                        variant={noteList.length > 0 ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 px-2 gap-1 shrink-0"
                        onClick={() => toggleNotes(p.id)}
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? "Hide" : "Show"} notes for ${p.name}`}
                      >
                        <MessageSquare className="size-3.5" />
                        <span className="text-xs">{noteList.length}</span>
                      </Button>
                    )}
                  </div>
                  {isOpen && p.personId && (
                    <NotesPanel
                      rideId={ride.id}
                      personId={p.personId}
                      notes={noteList}
                      currentUserId={currentUserId}
                      onAdd={onAddNote}
                      onUpdate={onUpdateNote}
                      onDelete={onDeleteNote}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NotesPanel({
  rideId,
  personId,
  notes,
  currentUserId,
  onAdd,
  onUpdate,
  onDelete,
}: {
  rideId: string;
  personId: string;
  notes: AirportNote[];
  currentUserId: string | null;
  onAdd: (rideId: string, personId: string, body: string) => Promise<boolean>;
  onUpdate: (
    noteId: string,
    rideId: string,
    personId: string,
    body: string
  ) => Promise<boolean>;
  onDelete: (noteId: string, rideId: string, personId: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const handleAdd = async () => {
    if (!draft.trim() || submitting) return;
    setSubmitting(true);
    const ok = await onAdd(rideId, personId, draft);
    if (ok) setDraft("");
    setSubmitting(false);
  };

  const handleSaveEdit = async (noteId: string) => {
    if (!editDraft.trim()) return;
    const ok = await onUpdate(noteId, rideId, personId, editDraft);
    if (ok) {
      setEditingId(null);
      setEditDraft("");
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!confirm("Delete this note?")) return;
    await onDelete(noteId, rideId, personId);
  };

  return (
    <div className="border-t bg-muted/20 px-3 py-3 space-y-3">
      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note (flight delay, no-show, swap, …)"
          rows={2}
          className="text-sm resize-y"
        />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={handleAdd}
            disabled={!draft.trim() || submitting}
          >
            {submitting ? "Saving…" : "Add note"}
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => {
            const isAuthor = currentUserId !== null && n.authorId === currentUserId;
            const isEditing = editingId === n.id;
            const edited = n.updatedAt !== n.createdAt;
            return (
              <li
                key={n.id}
                className="rounded border bg-background p-2 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {n.authorEmail ?? "Unknown"}
                    </span>
                    <span>
                      {" · "}
                      {formatRelativeTime(n.createdAt)}
                      {edited && " (edited)"}
                    </span>
                  </div>
                  {isAuthor && !isEditing && (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          setEditingId(n.id);
                          setEditDraft(n.body);
                        }}
                        aria-label="Edit note"
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(n.id)}
                        aria-label="Delete note"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1"
                        onClick={() => {
                          setEditingId(null);
                          setEditDraft("");
                        }}
                      >
                        <X className="size-3" /> Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 gap-1"
                        disabled={!editDraft.trim()}
                        onClick={() => handleSaveEdit(n.id)}
                      >
                        <Check className="size-3" /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Compact relative timestamp ("5m ago", "2h ago", or date). */
function formatRelativeTime(iso: string): string {
  const dt = new Date(iso);
  const diffSec = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}
