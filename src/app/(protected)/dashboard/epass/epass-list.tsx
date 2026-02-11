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
  ECKCM_people: {
    first_name_en: string;
    last_name_en: string;
    display_name_ko: string | null;
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
    };
  };
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
          const person = token.ECKCM_people;
          const reg = token.ECKCM_registrations;
          const event = reg.ECKCM_events;
          const displayName =
            person.display_name_ko ??
            `${person.first_name_en} ${person.last_name_en}`;

          return (
            <Link key={token.id} href={`/dashboard/epass/${token.id}`}>
              <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{displayName}</CardTitle>
                    <Badge variant={token.is_active ? "default" : "secondary"}>
                      {token.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>{event.name_en}</p>
                      <p>
                        {reg.start_date} ~ {reg.end_date}
                      </p>
                      {reg.confirmation_code && (
                        <p className="font-mono font-medium text-foreground">
                          {reg.confirmation_code}
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
