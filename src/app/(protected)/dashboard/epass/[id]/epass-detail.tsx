"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";

interface EPassDetailProps {
  token: {
    id: string;
    token: string;
    is_active: boolean;
    created_at: string;
    person_id: string;
    registration_id: string;
    participant_code: string | null;
    eckcm_people: {
      first_name_en: string;
      last_name_en: string;
      display_name_ko: string | null;
      gender: string;
      birth_date: string;
    };
    eckcm_registrations: {
      confirmation_code: string | null;
      status: string;
      start_date: string;
      end_date: string;
      event_id: string;
      eckcm_events: {
        name_en: string;
        name_ko: string | null;
        location: string | null;
      };
    };
  };
}

function getMealCategory(birthDate: string, eventDate: string): string {
  const birth = new Date(birthDate);
  const ref = new Date(eventDate);
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  if (age >= 11) return "Adult";
  if (age >= 5) return "Youth";
  return "Free";
}

export function EPassDetail({ token }: EPassDetailProps) {
  const person = token.eckcm_people;
  const reg = token.eckcm_registrations;
  const event = reg.eckcm_events;
  const displayName =
    person.display_name_ko ??
    `${person.first_name_en} ${person.last_name_en}`;
  const meal = getMealCategory(person.birth_date, reg.start_date);

  const [qrUrl, setQrUrl] = useState(`/epass/${token.token}`);
  useEffect(() => {
    setQrUrl(`${window.location.origin}/epass/${token.token}`);
  }, [token.token]);

  return (
    <div className="mx-auto max-w-md p-4 pt-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/epass">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">E-Pass</h1>
      </div>

      <Card>
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center gap-1.5 mb-2">
            <Badge
              variant={token.is_active ? "default" : "secondary"}
              className="text-sm"
            >
              {token.is_active ? "Active" : "Inactive"}
            </Badge>
            <Badge
              variant="outline"
              className={
                person.gender === "MALE"
                  ? "text-sm border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  : "text-sm border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
              }
            >
              {person.gender === "MALE" ? "Male" : "Female"}
            </Badge>
            <Badge
              variant="outline"
              className={
                meal === "Adult"
                  ? "text-sm border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : meal === "Youth"
                    ? "text-sm border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    : "text-sm border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300"
              }
            >
              {meal}
            </Badge>
          </div>
          <CardTitle className="text-xl">{displayName}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {person.first_name_en} {person.last_name_en}
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* QR Code */}
          <div className="flex justify-center p-4">
            <QRCodeSVG value={qrUrl} size={192} level="M" />
          </div>

          {token.participant_code && (
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Participant Code</p>
              <p className="text-2xl font-mono font-bold tracking-wider">
                {token.participant_code}
              </p>
            </div>
          )}

          <Separator />

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Event</span>
              <span className="font-medium">{event.name_en}</span>
            </div>
            {event.location && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Location</span>
                <span>{event.location}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Dates</span>
              <span>
                {reg.start_date} ~ {reg.end_date}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline">{reg.status}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
