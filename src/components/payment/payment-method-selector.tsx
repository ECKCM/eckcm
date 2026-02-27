"use client";

import { cn } from "@/lib/utils";
import { CreditCard, Building2, Smartphone } from "lucide-react";

export type PaymentMethodOption = "card" | "zelle" | "manual";

interface PaymentMethodSelectorProps {
  selected: PaymentMethodOption;
  onSelect: (method: PaymentMethodOption) => void;
  availableMethods?: PaymentMethodOption[];
}

const methodConfig: Record<
  PaymentMethodOption,
  { label: string; description: string; icon: React.ElementType }
> = {
  card: {
    label: "Credit / Debit Card",
    description: "Pay securely with Stripe",
    icon: CreditCard,
  },
  zelle: {
    label: "Zelle",
    description: "Send payment via Zelle",
    icon: Smartphone,
  },
  manual: {
    label: "Other Payment",
    description: "Check, cash, or other methods",
    icon: Building2,
  },
};

export function PaymentMethodSelector({
  selected,
  onSelect,
  availableMethods = ["card", "zelle"],
}: PaymentMethodSelectorProps) {
  return (
    <div className="space-y-2">
      {availableMethods.map((method) => {
        const config = methodConfig[method];
        const Icon = config.icon;
        return (
          <button
            key={method}
            type="button"
            onClick={() => onSelect(method)}
            className={cn(
              "flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-colors",
              selected === method
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50"
            )}
          >
            <Icon
              className={cn(
                "h-5 w-5 shrink-0",
                selected === method
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            />
            <div>
              <p className="font-medium">{config.label}</p>
              <p className="text-sm text-muted-foreground">
                {config.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
