"use client";

import { Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";

interface CheckVisualProps {
  accountName: string;
  routingNumber: string;
  confirmRoutingNumber: string;
  accountNumber: string;
  confirmAccountNumber: string;
  accountType: "checking" | "savings";
  amount: number;
  onAccountNameChange: (v: string) => void;
  onRoutingNumberChange: (v: string) => void;
  onConfirmRoutingNumberChange: (v: string) => void;
  onAccountNumberChange: (v: string) => void;
  onConfirmAccountNumberChange: (v: string) => void;
  onAccountTypeChange: (v: "checking" | "savings") => void;
}

export function CheckVisual({
  accountName,
  routingNumber,
  confirmRoutingNumber,
  accountNumber,
  confirmAccountNumber,
  accountType,
  amount,
  onAccountNameChange,
  onRoutingNumberChange,
  onConfirmRoutingNumberChange,
  onAccountNumberChange,
  onConfirmAccountNumberChange,
  onAccountTypeChange,
}: CheckVisualProps) {
  return (
    <div className="relative overflow-hidden border-2 border-teal-200 bg-gradient-to-br from-teal-50 via-emerald-50 to-cyan-50 p-5">
      {/* Security pattern overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent, transparent 10px, currentColor 10px, currentColor 10.5px)",
        }}
      />

      {/* Top decorative stripe */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-teal-400 via-emerald-400 to-teal-400" />

      {/* Header: Bank icon + Amount */}
      <div className="relative flex justify-between items-start mb-5 pt-1">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 ring-1 ring-teal-200">
            <Building2 className="h-4.5 w-4.5 text-teal-700" />
          </div>
          <div>
            <p className="text-sm font-bold text-teal-800 tracking-wide">
              BANK CHECK
            </p>
            <p className="text-[10px] text-teal-600">ACH Direct Debit</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-teal-600 uppercase tracking-widest">
            Amount
          </p>
          <p className="text-xl font-bold font-mono text-teal-900">
            ${(amount / 100).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Account Holder Name */}
      <div className="relative mb-4">
        <label className="block text-[11px] font-semibold text-teal-700 uppercase tracking-wider mb-1.5">
          Account Holder Name
        </label>
        <Input
          value={accountName}
          onChange={(e) => onAccountNameChange(e.target.value)}
          placeholder="Enter your full name as it appears on your checks"
          className="bg-white/80 border-teal-200 focus-visible:ring-teal-500 font-medium text-sm"
          required
        />
      </div>

      {/* "Pay to the order of" decorative line */}
      <div className="relative flex items-center gap-3 mb-4">
        <span className="text-[9px] font-bold text-teal-600 uppercase shrink-0 leading-tight">
          PAY TO THE
          <br />
          ORDER OF
        </span>
        <div className="flex-1 border-b-2 border-teal-300 border-dashed" />
        <div className="rounded-md border-2 border-teal-300 bg-white/60 px-3 py-1.5">
          <span className="font-mono font-bold text-teal-900 text-sm">
            ***{(amount / 100).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Memo line */}
      <div className="relative flex items-center gap-2 mb-5">
        <span className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider">
          Memo
        </span>
        <span className="text-xs text-teal-500 italic border-b border-teal-200 flex-1 pb-0.5">
          ECKCM Registration Payment
        </span>
      </div>

      {/* MICR section — Routing & Account Numbers */}
      <div className="relative border-t-2 border-teal-200 border-dashed pt-4 space-y-3">
        <p className="text-[10px] text-teal-600 mb-2">
          Find these numbers at the bottom of your check:
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <div>
              <label className="block text-[11px] font-mono font-semibold text-teal-700 mb-1.5">
                <span className="text-teal-400 mr-0.5">⑆</span> Routing Number
              </label>
              <Input
                value={routingNumber}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 9);
                  onRoutingNumberChange(v);
                }}
                placeholder="9 digits"
                className="bg-white/80 border-teal-200 focus-visible:ring-teal-500 tracking-[0.2em] text-center text-sm"
                style={{ fontFamily: '"MICR E13B", monospace' }}
                inputMode="numeric"
                maxLength={9}
                required
              />
              <p className="text-[9px] text-teal-500 mt-0.5 text-center">
                First 9 digits on check
              </p>
            </div>
            <div>
              <label className="block text-[11px] font-mono font-semibold text-teal-700 mb-1.5">
                Confirm Routing Number
              </label>
              <Input
                value={confirmRoutingNumber}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 9);
                  onConfirmRoutingNumberChange(v);
                }}
                placeholder="Re-enter routing number"
                className={`bg-white/80 border-teal-200 focus-visible:ring-teal-500 tracking-[0.2em] text-center text-sm ${confirmRoutingNumber && confirmRoutingNumber !== routingNumber ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                style={{ fontFamily: '"MICR E13B", monospace' }}
                inputMode="numeric"
                maxLength={9}
                required
              />
              {confirmRoutingNumber && confirmRoutingNumber !== routingNumber && (
                <p className="text-[9px] text-red-500 mt-0.5 text-center">
                  Numbers do not match
                </p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <label className="block text-[11px] font-mono font-semibold text-teal-700 mb-1.5">
                <span className="text-teal-400 mr-0.5">⑈</span> Account Number
              </label>
              <Input
                value={accountNumber}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 17);
                  onAccountNumberChange(v);
                }}
                placeholder="Up to 17 digits"
                className="bg-white/80 border-teal-200 focus-visible:ring-teal-500 tracking-[0.2em] text-center text-sm"
                style={{ fontFamily: '"MICR E13B", monospace' }}
                inputMode="numeric"
                maxLength={17}
                required
              />
              <p className="text-[9px] text-teal-500 mt-0.5 text-center">
                Middle number on check
              </p>
            </div>
            <div>
              <label className="block text-[11px] font-mono font-semibold text-teal-700 mb-1.5">
                Confirm Account Number
              </label>
              <Input
                value={confirmAccountNumber}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 17);
                  onConfirmAccountNumberChange(v);
                }}
                placeholder="Re-enter account number"
                className={`bg-white/80 border-teal-200 focus-visible:ring-teal-500 tracking-[0.2em] text-center text-sm ${confirmAccountNumber && confirmAccountNumber !== accountNumber ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                style={{ fontFamily: '"MICR E13B", monospace' }}
                inputMode="numeric"
                maxLength={17}
                required
              />
              {confirmAccountNumber && confirmAccountNumber !== accountNumber && (
                <p className="text-[9px] text-red-500 mt-0.5 text-center">
                  Numbers do not match
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Check diagram hint */}
        <div className="rounded-lg bg-white/50 border border-teal-100 px-3 py-2 mt-2">
          <p
            className="text-[10px] text-teal-600 text-center"
            style={{ fontFamily: '"MICR E13B", monospace' }}
          >
            ⑆ <span className="underline">routing</span> ⑆{" "}
            <span className="underline">account number</span> ⑈{" "}
            <span className="text-teal-400">check #</span>
          </p>
        </div>

        {/* Account type selection */}
        <div className="flex items-center gap-5 pt-1">
          <span className="text-[11px] font-semibold text-teal-700 uppercase tracking-wider">
            Account Type:
          </span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="accountType"
              value="checking"
              checked={accountType === "checking"}
              onChange={() => onAccountTypeChange("checking")}
              className="accent-teal-600"
            />
            <span className="text-xs font-medium text-teal-800">Checking</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="accountType"
              value="savings"
              checked={accountType === "savings"}
              onChange={() => onAccountTypeChange("savings")}
              className="accent-teal-600"
            />
            <span className="text-xs font-medium text-teal-800">Savings</span>
          </label>
        </div>
      </div>

      {/* Bottom decorative stripe */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-300 via-emerald-300 to-teal-300" />
    </div>
  );
}
