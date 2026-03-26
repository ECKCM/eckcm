"use client";

import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

interface EPassViewerProps {
  epass: {
    id: string;
    isActive: boolean;
    createdAt: string;
    confirmationCode: string | null;
    participantCode: string | null;
    qrValue: string | null;
    person: {
      firstName: string;
      lastName: string;
      displayNameKo: string | null;
      gender: string;
      birthDate: string;
      churchName: string | null;
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
  if (age >= 11) return "adult";
  if (age >= 5) return "youth";
  return "free";
}

export function EPassViewer({ epass }: EPassViewerProps) {
  const { t } = useI18n();
  const { person, registration } = epass;
  const { event } = registration;
  const meal = getMealCategory(person.birthDate, event.startDate);
  const mealLabel: Record<string, string> = { adult: t("epass.adult"), youth: t("epass.youth"), free: t("common.free") };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-950 dark:to-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl overflow-hidden">
        <CardHeader className="text-center pb-4 relative">
          {epass.confirmationCode && (
            <p className="absolute top-4 left-4 font-mono text-sm font-bold tracking-wider text-muted-foreground">
              {epass.confirmationCode}
            </p>
          )}
          {epass.participantCode && (
            <p className="absolute top-4 right-4 font-mono text-sm font-bold tracking-wider text-muted-foreground">
              {epass.participantCode}
            </p>
          )}
          <div className="flex justify-center mb-2">
            <ShieldCheck className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-xl">{event.year} ECKCM E-PASS</CardTitle>
          <div className="flex justify-center gap-1.5 mt-2">
            <Badge
              variant={epass.isActive ? "default" : "destructive"}
              className="text-base px-3 py-1"
            >
              {epass.isActive ? t("epass.active") : t("epass.inactive")}
            </Badge>
            {(person.gender === "MALE" || person.gender === "FEMALE") && (
              <Badge
                variant="outline"
                className={`text-base px-3 py-1 ${
                  person.gender === "MALE"
                    ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
                }`}
              >
                {person.gender === "MALE" ? t("profile.male") : t("profile.female")}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={`text-base px-3 py-1 ${
                meal === "adult"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : meal === "youth"
                    ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    : "border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300"
              }`}
            >
              {mealLabel[meal] ?? meal}
            </Badge>
          </div>
        </CardHeader>

        {/* Ticket notch divider */}
        <div className="relative flex items-center">
          <div className="w-6 h-6 rounded-full bg-blue-50 dark:bg-gray-950 -ml-3 shrink-0" />
          <div className="flex-1 border-t border-dashed border-border" />
          <div className="w-6 h-6 rounded-full bg-blue-50 dark:bg-gray-950 -mr-3 shrink-0" />
        </div>

        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-3">
            {/* Name */}
            <div className="text-center">
              <h2 className="text-4xl font-bold tracking-tight">
                {person.displayNameKo || `${person.firstName} ${person.lastName}`}
              </h2>
              {person.churchName && (
                <p className="text-xl text-muted-foreground mt-1">{person.churchName}</p>
              )}
            </div>

            {/* QR Code */}
            {epass.qrValue && (
              <div className="bg-white p-3 rounded-lg">
                <QRCodeSVG
                  value={epass.qrValue}
                  size={200}
                  level="H"
                  fgColor="#000000"
                  bgColor="#ffffff"
                />
              </div>
            )}

          </div>
        </CardContent>
      </Card>
    </div>
  );
}
