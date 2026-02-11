"use client";

import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { CheckCircle } from "lucide-react";

export default function ConfirmationPage() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const registrationId = searchParams.get("registrationId");

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6 text-center">
      <div className="flex justify-center">
        <CheckCircle className="h-16 w-16 text-green-500" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registration Complete!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {code && (
            <div>
              <p className="text-sm text-muted-foreground">
                Your confirmation code
              </p>
              <p className="text-3xl font-mono font-bold tracking-wider mt-2">
                {code}
              </p>
            </div>
          )}

          <Badge variant="secondary" className="text-sm">
            Payment Confirmed
          </Badge>

          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              A confirmation email with your E-Pass and registration details
              will be sent to the group leader&apos;s email address.
            </p>
            {registrationId && (
              <p className="text-xs">Registration ID: {registrationId}</p>
            )}
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <Button asChild size="lg">
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/epass">View E-Pass</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
