"use client";

import Link from "next/link";
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
    ECKCM_people: {
      first_name_en: string;
      last_name_en: string;
      display_name_ko: string | null;
      gender: string;
      birth_date: string;
    };
    ECKCM_registrations: {
      confirmation_code: string | null;
      status: string;
      start_date: string;
      end_date: string;
      event_id: string;
      ECKCM_events: {
        name_en: string;
        name_ko: string | null;
        location: string | null;
      };
    };
  };
}

export function EPassDetail({ token }: EPassDetailProps) {
  const person = token.ECKCM_people;
  const reg = token.ECKCM_registrations;
  const event = reg.ECKCM_events;
  const displayName =
    person.display_name_ko ??
    `${person.first_name_en} ${person.last_name_en}`;

  const qrUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/epass/${token.token}`;

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
          <div className="flex justify-center mb-2">
            <Badge
              variant={token.is_active ? "default" : "secondary"}
              className="text-sm"
            >
              {token.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
          <CardTitle className="text-xl">{displayName}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {person.first_name_en} {person.last_name_en}
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* QR Code placeholder - uses token URL */}
          <div className="flex justify-center p-4">
            <div className="w-48 h-48 bg-muted rounded-lg flex items-center justify-center border-2 border-dashed">
              <div className="text-center text-xs text-muted-foreground">
                <p className="font-mono text-[10px] break-all px-2">
                  {qrUrl}
                </p>
                <p className="mt-2">QR Code</p>
              </div>
            </div>
          </div>

          {reg.confirmation_code && (
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Confirmation Code</p>
              <p className="text-2xl font-mono font-bold tracking-wider">
                {reg.confirmation_code}
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
              <span className="text-muted-foreground">Gender</span>
              <span>{person.gender}</span>
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
