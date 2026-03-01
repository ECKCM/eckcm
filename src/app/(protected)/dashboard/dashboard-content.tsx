"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, QrCode, Receipt, ClipboardList, Settings } from "lucide-react";

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}.${dd}.${yy}`;
}

interface DashboardContentProps {
  user: {
    id: string;
    email: string;
  };
  person: {
    id: string;
    first_name_en: string;
    last_name_en: string;
    display_name_ko: string | null;
    gender: string;
    email: string | null;
  } | null;
  events: {
    id: string;
    name_en: string;
    name_ko: string | null;
    event_start_date: string;
    event_end_date: string;
    is_active: boolean;
  }[];
  isAdmin?: boolean;
}

export function DashboardContent({
  user,
  person,
  events,
}: DashboardContentProps) {
  const router = useRouter();
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);

  const displayName = person
    ? person.display_name_ko ??
      `${person.first_name_en} ${person.last_name_en}`
    : user.email;

  const handleRegister = (eventId: string) => {
    setNavigatingTo(eventId);
    router.push(`/register/${eventId}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 pt-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold">Welcome, {displayName}</h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>

      {/* Active Events */}
      {events.length > 0 ? (
        events.map((event) => (
          <Card key={event.id}>
            <CardHeader>
              <CardTitle>{event.name_en}</CardTitle>
              <CardDescription>
                {formatShortDate(event.event_start_date)} - {formatShortDate(event.event_end_date)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full text-lg font-bold tracking-wide"
                size="lg"
                onClick={() => handleRegister(event.id)}
                disabled={navigatingTo === event.id}
              >
                {navigatingTo === event.id ? (
                  <>
                    <Loader2 className="mr-2 size-5 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Register Now"
                )}
              </Button>
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No active events at this time.
          </CardContent>
        </Card>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="h-auto py-4 flex-col"
          onClick={() => router.push("/dashboard/epass")}
        >
          <QrCode className="h-5 w-5" />
          <span className="text-lg font-extrabold">E-Pass</span>
          <span className="text-xs text-muted-foreground">View group passes</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-4 flex-col"
          onClick={() => router.push("/dashboard/receipts")}
        >
          <Receipt className="h-5 w-5" />
          <span className="text-lg">Receipts</span>
          <span className="text-xs text-muted-foreground">View receipts</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-4 flex-col"
          onClick={() => router.push("/dashboard/registrations")}
        >
          <ClipboardList className="h-5 w-5" />
          <span className="text-lg">Registrations</span>
          <span className="text-xs text-muted-foreground">View history</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-4 flex-col"
          onClick={() => router.push("/dashboard/settings")}
        >
          <Settings className="h-5 w-5" />
          <span className="text-lg">Settings</span>
          <span className="text-xs text-muted-foreground">Edit profile</span>
        </Button>
      </div>
    </div>
  );
}
