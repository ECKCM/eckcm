import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";

interface AdminOnlyRegistrationGateProps {
  adminOnly: boolean;
  isAdmin: boolean;
  eventName: string;
  children: ReactNode;
}

export function AdminOnlyRegistrationGate({
  adminOnly,
  isAdmin,
  eventName,
  children,
}: AdminOnlyRegistrationGateProps) {
  if (!adminOnly || isAdmin) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-amber-50">
            <Lock className="size-6 text-amber-600" />
          </div>
          <CardTitle>{eventName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground">
            Registration for this event is temporarily restricted to staff.
          </p>
          <p className="text-sm text-muted-foreground">
            Please check back later or contact the organizer if you have questions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
