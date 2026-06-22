"use client";

import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, BookOpen, Newspaper } from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";

interface EPassViewerProps {
  bookletUrl?: string;
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

export function EPassViewer({ epass, bookletUrl }: EPassViewerProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { person, registration } = epass;
  const { event } = registration;
  const meal = getMealCategory(person.birthDate, event.startDate);
  const mealLabel: Record<string, string> = { adult: "General", youth: "Youth", free: "Free" };

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
              {epass.isActive ? "Active" : "Inactive"}
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
                {person.gender === "MALE" ? "Male" : "Female"}
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

            {/* QR Code — when the code cannot be resolved, show an explicit
                fallback with the manual check-in code instead of an empty gap */}
            {epass.qrValue ? (
              <div className="bg-white p-3 rounded-lg">
                <QRCodeSVG
                  value={epass.qrValue}
                  size={200}
                  level="H"
                  fgColor="#000000"
                  bgColor="#ffffff"
                />
              </div>
            ) : (
              <div className="w-full rounded-lg border border-amber-300 bg-amber-50 p-4 text-center dark:border-amber-700 dark:bg-amber-950">
                <p className="font-semibold text-amber-800 dark:text-amber-300">
                  QR code unavailable
                </p>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                  QR 코드를 불러올 수 없습니다. 체크인 데스크에서 아래 코드를
                  보여주세요.
                  <br />
                  Please show the code below at the check-in desk.
                </p>
                {(epass.participantCode || epass.confirmationCode) && (
                  <p className="mt-2 font-mono text-2xl font-bold tracking-wider text-amber-900 dark:text-amber-200">
                    {epass.participantCode || epass.confirmationCode}
                  </p>
                )}
              </div>
            )}

          </div>
        </CardContent>

        <div className="grid grid-cols-2 gap-3 px-6 pb-6">
          <Button
            variant="outline"
            className="w-full gap-2"
            asChild
          >
            <a
              href="https://cksda.church/eckcm"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Newspaper className="size-4" />
              {t("dashboard.newspaper")}
            </a>
          </Button>
          <Button
            variant="outline"
            className="w-full gap-2"
            disabled={!bookletUrl}
            onClick={() => router.push("/booklet")}
          >
            <BookOpen className="size-4" />
            {t("dashboard.booklet")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
