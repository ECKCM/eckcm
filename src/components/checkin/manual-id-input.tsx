"use client";

import { useRef, useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Keyboard } from "lucide-react";

interface ManualIdInputProps {
  disabled?: boolean;
  /** Called with the typed code (uppercased, trimmed). */
  onSubmit: (participantCode: string) => void;
  placeholder?: string;
}

/**
 * Manual fallback for when a QR doesn't scan. Accepts a 6-char participant code
 * (or signed CODE.SIGNATURE form) and submits it to the same flow the scanner uses.
 */
export function ManualIdInput({
  disabled,
  onSubmit,
  placeholder = "Participant ID (e.g. ABCD23)",
}: ManualIdInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim().toUpperCase();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <div className="relative flex-1">
        <Keyboard className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-8 font-mono uppercase tracking-wider"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
        />
      </div>
      <Button type="submit" disabled={disabled || !value.trim()}>
        Submit
      </Button>
    </form>
  );
}
