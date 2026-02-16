"use client";

import { cn } from "@/lib/utils";

const STEPS = [
  { number: 1, label: "Dates & Group" },
  { number: 2, label: "Instructions" },
  { number: 3, label: "Participants" },
  { number: 4, label: "Lodging" },
  { number: 5, label: "Key Deposit" },
  { number: 6, label: "Airport" },
];

export function WizardStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-1 py-4">
      {STEPS.map((step, i) => (
        <div key={step.number} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-sm font-medium",
                currentStep === step.number
                  ? "bg-primary text-primary-foreground"
                  : currentStep > step.number
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {currentStep > step.number ? "✓" : step.number}
            </div>
            <span className="mt-1 text-xs text-muted-foreground hidden sm:block">
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={cn(
                "mx-1 h-0.5 w-4",
                currentStep > step.number ? "bg-primary" : "bg-muted"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
