"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
}

export function DashboardContent({
  user,
  person,
  events,
}: DashboardContentProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const displayName = person
    ? person.display_name_ko ??
      `${person.first_name_en} ${person.last_name_en}`
    : user.email;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 pt-8">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {displayName}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          Sign Out
        </Button>
      </div>

      {/* Active Events */}
      {events.length > 0 ? (
        events.map((event) => (
          <Card key={event.id}>
            <CardHeader>
              <CardTitle>{event.name_en}</CardTitle>
              <CardDescription>
                {event.event_start_date} ~ {event.event_end_date}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                size="lg"
                onClick={() => router.push(`/register/${event.id}`)}
              >
                Register Now
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
          <span className="text-lg">E-Pass</span>
          <span className="text-xs text-muted-foreground">View your passes</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-4 flex-col"
          onClick={() => router.push("/dashboard/receipts")}
        >
          <span className="text-lg">Receipts</span>
          <span className="text-xs text-muted-foreground">View receipts</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-4 flex-col"
          onClick={() => router.push("/dashboard/registrations")}
        >
          <span className="text-lg">Registrations</span>
          <span className="text-xs text-muted-foreground">View history</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-4 flex-col"
          onClick={() => router.push("/dashboard/settings")}
        >
          <span className="text-lg">Settings</span>
          <span className="text-xs text-muted-foreground">Edit profile</span>
        </Button>
      </div>
    </div>
  );
}
