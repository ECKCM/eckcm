"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

export default function EmailSettingsPage() {
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSendTest() {
    if (!testEmail) return;
    setSending(true);
    setStatus(null);
    try {
      const res = await fetch("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail }),
      });
      if (res.ok) {
        setStatus("Test email sent successfully!");
      } else {
        setStatus("Failed to send test email. Check server logs.");
      }
    } catch {
      setStatus("Error sending test email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Email Settings</h1>
      </header>
      <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Email Provider</CardTitle>
            <CardDescription>
              Email is powered by Resend. Configure your API key in environment variables.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Provider</Label>
              <p className="text-sm text-muted-foreground">Resend</p>
            </div>
            <div>
              <Label>From Address</Label>
              <p className="text-sm text-muted-foreground">
                {process.env.NEXT_PUBLIC_EMAIL_FROM || "ECKCM <noreply@my.eckcm.com>"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Send Test Email</CardTitle>
            <CardDescription>
              Verify your email configuration by sending a test email.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="recipient@example.com"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
              <Button onClick={handleSendTest} disabled={sending || !testEmail}>
                {sending ? "Sending..." : "Send Test"}
              </Button>
            </div>
            {status && (
              <p className="text-sm text-muted-foreground">{status}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
