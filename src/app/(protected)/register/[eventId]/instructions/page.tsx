"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRegistration } from "@/lib/context/registration-context";
import { WizardStepper } from "@/components/registration/wizard-stepper";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SanitizedHtml } from "@/components/shared/sanitized-html";

export default function InstructionsStep() {
  const router = useRouter();
  const { eventId } = useParams<{ eventId: string }>();
  const { state, dispatch } = useRegistration();
  const [content, setContent] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!state.startDate) {
      router.push(`/register/${eventId}`);
      return;
    }

    const fetchContent = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("eckcm_legal_content")
        .select("content")
        .eq("slug", "registration-instructions")
        .single();
      setContent(data?.content ?? "");
      setLoading(false);
    };
    fetchContent();
  }, [state.startDate, router, eventId]);

  if (!state.startDate || loading) {
    return null;
  }

  const handleNext = () => {
    dispatch({ type: "SET_STEP", step: 3 });
    router.push(`/register/${eventId}/participants`);
  };

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <WizardStepper currentStep={2} />

      <Card>
        <CardHeader>
          <CardTitle>Step 2: Instructions</CardTitle>
          <CardDescription>
            Please read the following information carefully before proceeding.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <SanitizedHtml
            html={content}
            className="prose prose-sm max-w-none dark:prose-invert"
          />

          <div className="flex items-center gap-3 rounded-lg border p-4">
            <Checkbox
              id="agree"
              checked={agreed}
              onCheckedChange={(v) => setAgreed(v === true)}
            />
            <Label htmlFor="agree" className="cursor-pointer">
              I have read and agree to the information above.
            </Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => router.push(`/register/${eventId}`)}
        >
          Back
        </Button>
        <Button onClick={handleNext} disabled={!agreed}>
          Next: Participants
        </Button>
      </div>
    </div>
  );
}
