"use client";

import { useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck, Copy, Check } from "lucide-react";

interface EPassDetailProps {
  token: {
    token: string;
    is_active: boolean;
    participant_code: string | null;
    qr_value: string | null;
    eckcm_people: {
      first_name_en: string;
      last_name_en: string;
      gender: string;
      birth_date: string;
    };
    eckcm_registrations: {
      start_date: string;
      eckcm_events: {
        year: number;
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

function buildEPassSlug(
  firstName: string,
  lastName: string,
  token: string,
): string {
  const name = `${firstName}${lastName}`.replace(/[^a-zA-Z0-9]/g, "");
  return `${name}_${token}`;
}

export function EPassDetail({ token }: EPassDetailProps) {
  const person = token.eckcm_people;
  const reg = token.eckcm_registrations;
  const event = reg.eckcm_events;
  const meal = getMealCategory(person.birth_date, reg.start_date);
  const slug = buildEPassSlug(
    person.first_name_en,
    person.last_name_en,
    token.token,
  );

  const [copied, setCopied] = useState(false);

  async function handleCopyLink() {
    const url = `${window.location.origin}/epass/${slug}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto max-w-md p-4 pt-8 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/epass">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">E-Pass</h1>
      </div>

      <Card className="shadow-xl overflow-hidden">
        <CardHeader className="text-center pb-4 relative">
          {token.participant_code && (
            <p className="absolute top-4 right-4 font-mono text-sm font-bold tracking-wider text-muted-foreground">
              {token.participant_code}
            </p>
          )}
          <div className="flex justify-center mb-2">
            <ShieldCheck className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-xl">
            {event.year} ECKCM E-PASS
          </CardTitle>
          <div className="flex justify-center gap-1.5 mt-2">
            <Badge
              variant={token.is_active ? "default" : "destructive"}
              className="text-base px-3 py-1"
            >
              {token.is_active ? "Active" : "Inactive"}
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
                meal === "Adult"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : meal === "Youth"
                    ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    : "border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300"
              }`}
            >
              {meal}
            </Badge>
          </div>
        </CardHeader>

        {/* Ticket notch divider */}
        <div className="relative flex items-center">
          <div className="w-6 h-6 rounded-full bg-background -ml-3 shrink-0" />
          <div className="flex-1 border-t border-dashed border-border" />
          <div className="w-6 h-6 rounded-full bg-background -mr-3 shrink-0" />
        </div>

        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">
              {person.first_name_en} {person.last_name_en}
            </h2>

            {token.qr_value && (
              <div className="bg-white p-3 rounded-lg">
                <QRCodeSVG
                  value={token.qr_value}
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

      <Button
        variant="outline"
        className="w-full gap-2"
        onClick={handleCopyLink}
      >
        {copied ? (
          <>
            <Check className="h-4 w-4" /> Link Copied!
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" /> Copy E-Pass Link
          </>
        )}
      </Button>
    </div>
  );
}
