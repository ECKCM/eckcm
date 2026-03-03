"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import Link from "next/link";

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  return (
    <Card className="bg-muted/50">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <Mail className="h-10 w-10 text-primary" />
        </div>
        <CardTitle className="text-2xl font-bold">Check Your Email</CardTitle>
        <CardDescription>
          We sent a confirmation link to
          {email && (
            <span className="block mt-1 font-medium text-foreground">{email}</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-center text-sm text-muted-foreground">
        <p>
          Click the link in the email to confirm your account and complete signup.
        </p>
        <p>
          Didn&apos;t receive an email? Check your spam folder or{" "}
          <Link href="/signup" className="underline text-primary hover:text-primary/80">
            try signing up again
          </Link>
          .
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/login">Back to Login</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense>
      <CheckEmailContent />
    </Suspense>
  );
}
