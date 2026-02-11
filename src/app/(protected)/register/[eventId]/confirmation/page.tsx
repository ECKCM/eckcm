"use client";

import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function ConfirmationPage() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6 text-center">
      <Card>
        <CardHeader>
          <CardTitle>Registration Confirmed!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {code && (
            <div>
              <p className="text-sm text-muted-foreground">
                Your confirmation code:
              </p>
              <p className="text-3xl font-mono font-bold tracking-wider mt-2">
                {code}
              </p>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            A confirmation email will be sent to your registered email address.
          </p>
          <Button asChild>
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
