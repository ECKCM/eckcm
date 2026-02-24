"use client";

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Calendar, MapPin, ShieldCheck } from "lucide-react";

interface EPassViewerProps {
  token: string;
  epass: {
    id: string;
    isActive: boolean;
    createdAt: string;
    participantCode: string | null;
    person: {
      firstName: string;
      lastName: string;
      koreanName: string | null;
      gender: string;
      birthDate: string;
    };
    registration: {
      event: {
        nameEn: string;
        nameKo: string | null;
        year: number;
        startDate: string;
        endDate: string;
        venue: string;
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

export function EPassViewer({ token, epass }: EPassViewerProps) {
  const { person, registration } = epass;
  const { event } = registration;
  const meal = getMealCategory(person.birthDate, event.startDate);

  const [qrUrl, setQrUrl] = useState(`/epass/${token}`);
  useEffect(() => {
    setQrUrl(`${window.location.origin}/epass/${token}`);
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-950 dark:to-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center border-b pb-4">
          <div className="flex justify-center mb-2">
            <ShieldCheck className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-xl">ECKCM E-Pass</CardTitle>
          <p className="text-sm text-muted-foreground">
            {event.nameEn} {event.year}
            {event.nameKo && ` / ${event.nameKo}`}
          </p>
          <div className="flex justify-center gap-1.5 mt-2">
            <Badge
              variant={epass.isActive ? "default" : "destructive"}
            >
              {epass.isActive ? "Active" : "Inactive"}
            </Badge>
            <Badge
              variant="outline"
              className={
                person.gender === "MALE"
                  ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
              }
            >
              {person.gender === "MALE" ? "Male" : "Female"}
            </Badge>
            <Badge
              variant="outline"
              className={
                meal === "Adult"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : meal === "Youth"
                    ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    : "border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300"
              }
            >
              {meal}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* QR Code */}
          <div className="flex flex-col items-center gap-2">
            <QRCodeSVG value={qrUrl} size={192} level="M" />
          </div>

          {/* Person Info */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-semibold">
                  {person.firstName} {person.lastName}
                </p>
                {person.koreanName && (
                  <p className="text-sm text-muted-foreground">
                    {person.koreanName}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">
                  {event.startDate} ~ {event.endDate}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm">{event.venue}</p>
              </div>
            </div>
          </div>

          {/* Participant Code */}
          {epass.participantCode && (
            <div className="text-center border-t pt-4">
              <p className="text-xs text-muted-foreground">Participant Code</p>
              <p className="font-mono text-lg font-bold tracking-wider">
                {epass.participantCode}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
