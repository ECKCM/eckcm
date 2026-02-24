"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, QrCode } from "lucide-react";

interface EPassToken {
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

export function EPassList({ tokens }: { tokens: EPassToken[] }) {
  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">E-Pass</h1>
      </div>

      {tokens.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No E-Pass available yet. Complete payment to receive your E-Pass.
          </CardContent>
        </Card>
      ) : (
        tokens.map((token) => {
          const person = token.eckcm_people;
          const reg = token.eckcm_registrations;
          const event = reg.eckcm_events;
          const displayName =
            person.display_name_ko ??
            `${person.first_name_en} ${person.last_name_en}`;
          const meal = getMealCategory(person.birth_date, reg.start_date);

          return (
            <Link key={token.id} href={`/dashboard/epass/${token.id}`}>
              <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{displayName}</CardTitle>
                    <div className="flex items-center gap-1.5">
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
                      <Badge variant={token.is_active ? "default" : "secondary"}>
                        {token.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>{event.name_en}</p>
                      <p>
                        {reg.start_date} ~ {reg.end_date}
                      </p>
                      {token.participant_code && (
                        <p className="font-mono font-medium text-foreground">
                          {token.participant_code}
                        </p>
                      )}
                    </div>
                    <QrCode className="h-10 w-10 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })
      )}
    </div>
  );
}
