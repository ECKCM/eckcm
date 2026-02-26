"use client";

import { CreditCard, Building2, Landmark } from "lucide-react";

export type MethodId = "card" | "ach" | "zelle" | "check";

export interface PaymentMethodDef {
  id: MethodId;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  iconBg: string;
}

export const STRIPE_EL_STYLE = {
  base: {
    fontSize: "16px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: "#0f172a",
    "::placeholder": { color: "#94a3b8" },
    lineHeight: "24px",
  },
  invalid: { color: "#ef4444", iconColor: "#ef4444" },
};

export const MAIN_METHODS: PaymentMethodDef[] = [
  {
    id: "card",
    label: "Card",
    sublabel: "Visa, Mastercard, Amex",
    icon: <CreditCard className="h-5 w-5" />,
    iconBg: "bg-slate-100 text-slate-700",
  },
  {
    id: "ach",
    label: "US Bank",
    sublabel: "ACH Transfer",
    icon: <Building2 className="h-5 w-5" />,
    iconBg: "bg-blue-100 text-blue-700",
  },
  {
    id: "zelle",
    label: "Zelle",
    sublabel: "Pay later via Zelle",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="#6d1ed4">
        <path d="M13.559 24h-2.841a.483.483 0 0 1-.483-.483v-2.765H5.638a.667.667 0 0 1-.666-.666v-2.234a.67.67 0 0 1 .142-.412l8.139-10.382h-7.25a.667.667 0 0 1-.667-.667V3.914c0-.367.299-.666.666-.666h4.23V.483c0-.266.217-.483.483-.483h2.841c.266 0 .483.217.483.483v2.765h4.323c.367 0 .666.299.666.666v2.137a.67.67 0 0 1-.141.41l-8.19 10.481h7.665c.367 0 .666.299.666.666v2.477a.667.667 0 0 1-.666.667h-4.32v2.765a.483.483 0 0 1-.483.483" />
      </svg>
    ),
    iconBg: "bg-purple-100",
  },
  {
    id: "check",
    label: "Bank Check",
    sublabel: "ACH Direct Debit",
    icon: <Landmark className="h-5 w-5" />,
    iconBg: "bg-teal-100 text-teal-700",
  },
];

export const STRIPE_APPEARANCE = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#0f172a",
    colorBackground: "#ffffff",
    colorText: "#0f172a",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    borderRadius: "8px",
  },
};
