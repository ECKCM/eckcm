"use client";

import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function PaymentStep() {
  const searchParams = useSearchParams();
  const registrationId = searchParams.get("registrationId");

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-muted-foreground">
            Registration submitted successfully!
          </p>
          <p className="text-sm text-muted-foreground">
            Registration ID: {registrationId}
          </p>
          <p className="text-sm text-muted-foreground">
            Stripe payment integration will be added in Phase 5.
          </p>
          <Button asChild>
            <Link href="/dashboard">Return to Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
