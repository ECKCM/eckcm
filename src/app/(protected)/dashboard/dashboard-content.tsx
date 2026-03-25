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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, QrCode, Receipt, ClipboardList, Check, Shield, LifeBuoy } from "lucide-react";

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
  registeredEventIds: string[];
  allowDuplicateRegistration: boolean;
}

type RegistrationType = "self" | "others";

export function DashboardContent({
  user,
  person,
  events,
  registeredEventIds,
  allowDuplicateRegistration,
  isAdmin,
}: DashboardContentProps) {
  const router = useRouter();
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<Record<string, RegistrationType>>({});
  const [othersDialogEventId, setOthersDialogEventId] = useState<string | null>(null);
  const [othersConfirmed, setOthersConfirmed] = useState(false);

  const displayName = person
    ? person.display_name_ko ??
      `${person.first_name_en} ${person.last_name_en}`
    : user.email;

  const registeredSet = new Set(registeredEventIds);

  const clearAndNavigate = (eventId: string, type: RegistrationType) => {
    sessionStorage.removeItem("eckcm_registration");
    setNavigatingTo(eventId);
    setSelectedTypes((prev) => ({ ...prev, [eventId]: type }));
    router.push(`/register/${eventId}?type=${type}`);
  };

  const handleRegister = (eventId: string) => {
    clearAndNavigate(eventId, "self");
  };

  const handleTypeSelect = (eventId: string, type: RegistrationType) => {
    if (type === "others") {
      setOthersDialogEventId(eventId);
      setOthersConfirmed(false);
    }
  };

  const handleOthersConfirm = () => {
    if (othersDialogEventId) {
      clearAndNavigate(othersDialogEventId, "others");
    }
    setOthersDialogEventId(null);
    setOthersConfirmed(false);
  };

  const handleOthersCancel = () => {
    setOthersDialogEventId(null);
    setOthersConfirmed(false);
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
        events.map((event) => {
          const isRegistered = registeredSet.has(event.id);
          const selfDisabled = isRegistered && !allowDuplicateRegistration;
          const currentType = selectedTypes[event.id] ?? (selfDisabled ? "others" : "self");

          return (
            <Card key={event.id}>
              <CardHeader>
                <CardTitle>{event.name_en}</CardTitle>
                <CardDescription>
                  {formatShortDate(event.event_start_date)} - {formatShortDate(event.event_end_date)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Already registered banner */}
                {isRegistered && (
                  <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                    <Check className="size-4 shrink-0" />
                    <span className="font-medium">You are already registered</span>
                  </div>
                )}

                {/* Register Now button */}
                <Button
                  className="w-full text-lg font-bold tracking-wide"
                  size="lg"
                  onClick={() => handleRegister(event.id)}
                  disabled={selfDisabled || navigatingTo === event.id}
                >
                  {navigatingTo === event.id && currentType === "self" ? (
                    <>
                      <Loader2 className="mr-2 size-5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Register Now"
                  )}
                </Button>

                {/* Register for someone else */}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleTypeSelect(event.id, "others")}
                  disabled={navigatingTo === event.id}
                >
                  {navigatingTo === event.id && currentType === "others" ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Register for Someone Else"
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">&quot;Register for Someone Else&quot; lets you register on behalf of others — this will not include you as a participant.</p>
              </CardContent>
            </Card>
          );
        })
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No active events at this time.
          </CardContent>
        </Card>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-3">
        {isAdmin && (
          <Button
            variant="outline"
            className="h-auto py-4 flex-col border-primary/30 bg-primary/5"
            onClick={() => router.push("/admin")}
          >
            <Shield className="h-5 w-5 text-primary" />
            <span className="text-lg font-extrabold text-primary">Admin</span>
            <span className="text-xs text-muted-foreground">Manage events</span>
          </Button>
        )}
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
          onClick={() => router.push("/dashboard/registrations")}
        >
          <ClipboardList className="h-5 w-5" />
          <span className="text-lg">Registrations</span>
          <span className="text-xs text-muted-foreground">View history</span>
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
          onClick={() => window.open("/support", "_blank")}
        >
          <LifeBuoy className="h-5 w-5" />
          <span className="text-lg">Support</span>
          <span className="text-xs text-muted-foreground">Get help</span>
        </Button>
      </div>

      {/* Confirmation dialog for registering on behalf of others */}
      <AlertDialog open={!!othersDialogEventId} onOpenChange={(open) => { if (!open) handleOthersCancel(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registering for Someone Else</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  You are about to register on behalf of another person or group.
                  The registration will be linked to your account.
                </p>
                <p>
                  Signed in as <span className="font-semibold text-foreground">{displayName}</span> (<span className="break-all">{user.email}</span>)
                </p>
                <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={othersConfirmed}
                    onChange={(e) => setOthersConfirmed(e.target.checked)}
                    className="mt-0.5 size-4 rounded border-gray-300"
                  />
                  <span className="text-sm">
                    I understand that I am registering on behalf of someone else and that this registration will be linked to my account.
                  </span>
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleOthersCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleOthersConfirm} disabled={!othersConfirmed}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
