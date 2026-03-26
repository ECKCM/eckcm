"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

const STEP_KEYS = [
  "wizard.dates",
  "wizard.info",
  "wizard.people",
  "wizard.lodging",
  "wizard.keys",
  "wizard.airport",
  "wizard.review",
  "wizard.payment",
];

export function WizardStepper({ currentStep }: { currentStep: number }) {
  const { t } = useI18n();
  const steps = STEP_KEYS.map((key, i) => ({ number: i + 1, label: t(key) }));

  return (
    <div className="flex items-center justify-center gap-0.5 py-4">
      {steps.map((step, i) => (
        <div key={step.number} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-xs font-medium",
                currentStep === step.number
                  ? "bg-primary text-primary-foreground"
                  : currentStep > step.number
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {currentStep > step.number ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                step.number
              )}
            </div>
            <span
              className={cn(
                "mt-1 text-[10px] hidden sm:block",
                currentStep === step.number
                  ? "text-primary font-medium"
                  : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                "mx-0.5 h-0.5 w-3",
                currentStep > step.number ? "bg-primary" : "bg-muted"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
