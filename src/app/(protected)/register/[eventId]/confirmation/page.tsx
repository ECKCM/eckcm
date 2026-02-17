"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { CheckCircle, Clock, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type PaymentStatus = "loading" | "paid" | "pending" | "error";

export default function ConfirmationPage() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const registrationId = searchParams.get("registrationId");
  const [status, setStatus] = useState<PaymentStatus>("loading");

  useEffect(() => {
    if (!registrationId) {
      setStatus("error");
      return;
    }

    let attempts = 0;
    const maxAttempts = 10;

    async function checkStatus() {
      const supabase = createClient();
      const { data } = await supabase
        .from("eckcm_registrations")
        .select("status")
        .eq("id", registrationId!)
        .single();

      if (data?.status === "PAID") {
        setStatus("paid");
        return true;
      }

      attempts++;
      if (attempts >= maxAttempts) {
        setStatus("pending");
        return true;
      }
      return false;
    }

    // Check immediately, then poll every 2s
    checkStatus().then((done) => {
      if (done) return;
      const interval = setInterval(async () => {
        const done = await checkStatus();
        if (done) clearInterval(interval);
      }, 2000);
      return () => clearInterval(interval);
    });
  }, [registrationId]);

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6 text-center">
        <Card>
          <CardContent className="py-12 space-y-4">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">
              Verifying payment status...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6 text-center">
        <Card>
          <CardContent className="py-12 space-y-4">
            <p className="text-destructive">
              Could not verify registration. Please check your dashboard.
            </p>
            <Button asChild>
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPaid = status === "paid";

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6 text-center">
      <div className="flex justify-center">
        {isPaid ? (
          <CheckCircle className="h-16 w-16 text-green-500" />
        ) : (
          <Clock className="h-16 w-16 text-yellow-500" />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {isPaid ? "Registration Complete!" : "Payment Processing"}
          </CardTitle>
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

          <Badge
            variant={isPaid ? "secondary" : "outline"}
            className="text-sm"
          >
            {isPaid ? "Payment Confirmed" : "Payment Processing..."}
          </Badge>

          <div className="text-sm text-muted-foreground space-y-2">
            {isPaid ? (
              <p>
                A confirmation email with your E-Pass and registration details
                will be sent to the group representative&apos;s email address.
              </p>
            ) : (
              <p>
                Your payment is being processed. You can check your registration
                status in your dashboard. A confirmation email will be sent once
                payment is confirmed.
              </p>
            )}
            {registrationId && (
              <p className="text-xs">Registration ID: {registrationId}</p>
            )}
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <Button asChild size="lg">
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
            {isPaid && (
              <Button asChild variant="outline">
                <Link href="/dashboard/epass">View E-Pass</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
