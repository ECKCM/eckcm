"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Clock } from "lucide-react";
import { format } from "date-fns";

interface RegistrationDateGateProps {
  registrationStartDate: string | null;
  registrationEndDate: string | null;
  eventName: string;
  children: ReactNode;
}

export function RegistrationDateGate({
  registrationStartDate,
  registrationEndDate,
  eventName,
  children,
}: RegistrationDateGateProps) {
  const now = new Date();

  // If no dates set, pass through (rely on is_active only)
  if (!registrationStartDate && !registrationEndDate) {
    return <>{children}</>;
  }

  // Before registration opens
  if (registrationStartDate && now < new Date(registrationStartDate)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-blue-50">
              <Clock className="size-6 text-blue-600" />
            </div>
            <CardTitle>{eventName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-muted-foreground">
              Registration is not yet open.
            </p>
            <p className="text-sm font-medium">
              Opens on {format(new Date(registrationStartDate), "MMMM d, yyyy 'at' h:mm a")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // After registration closes
  if (registrationEndDate && now > new Date(registrationEndDate)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-red-50">
              <AlertCircle className="size-6 text-red-600" />
            </div>
            <CardTitle>{eventName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-muted-foreground">
              Registration is now closed.
            </p>
            <p className="text-sm text-muted-foreground">
              Closed on {format(new Date(registrationEndDate), "MMMM d, yyyy 'at' h:mm a")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Within registration window
  return <>{children}</>;
}
