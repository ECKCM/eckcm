"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QrCode, User, Calendar, MapPin, ShieldCheck } from "lucide-react";

interface EPassViewerProps {
  token: string;
  epass: {
    id: string;
    isActive: boolean;
    createdAt: string;
    person: {
      firstName: string;
      lastName: string;
      koreanName: string | null;
      gender: string;
      birthDate: string;
    };
    registration: {
      confirmationCode: string;
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

export function EPassViewer({ token, epass }: EPassViewerProps) {
  const { person, registration } = epass;
  const { event } = registration;

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
          <Badge
            variant={epass.isActive ? "default" : "destructive"}
            className="mt-2"
          >
            {epass.isActive ? "Active" : "Inactive"}
          </Badge>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* QR Code Area */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-48 h-48 bg-muted rounded-lg flex items-center justify-center border-2 border-dashed">
              <QrCode className="h-20 w-20 text-muted-foreground" />
            </div>
            <p className="font-mono text-xs text-muted-foreground break-all text-center">
              {token}
            </p>
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
                <p className="text-xs text-muted-foreground">
                  {person.gender} &middot; {person.birthDate}
                </p>
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

          {/* Confirmation Code */}
          <div className="text-center border-t pt-4">
            <p className="text-xs text-muted-foreground">Confirmation Code</p>
            <p className="font-mono text-lg font-bold tracking-wider">
              {registration.confirmationCode}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
