"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface RegistrationCodeComboboxProps {
  codes: string[];
  value: string;
  onValueChange: (value: string) => void;
  error?: boolean;
  placeholder?: string;
  className?: string;
}

export function RegistrationCodeCombobox({
  codes,
  value,
  onValueChange,
  error,
  placeholder,
  className,
}: RegistrationCodeComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const filtered = useMemo(() => {
    if (!inputValue) return codes;
    const q = inputValue.toLowerCase();
    return codes.filter((c) => c.toLowerCase().includes(q));
  }, [codes, inputValue]);

  const showNone = !inputValue || "none".includes(inputValue.toLowerCase());

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          onValueChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? "Type or select registration code..."}
        className={cn(className, error && "border-destructive")}
        autoComplete="off"
      />
      {open && (filtered.length > 0 || showNone) && (
        <div className="absolute z-50 mt-1 max-h-[200px] w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {showNone && (
            <button
              key="__none__"
              type="button"
              className={cn(
                "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none hover:bg-accent hover:text-accent-foreground text-muted-foreground italic",
                !value && "bg-accent"
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                setInputValue("");
                onValueChange("");
                setOpen(false);
                inputRef.current?.blur();
              }}
            >
              None
              {!value && (
                <span className="absolute right-2 flex size-4 items-center justify-center">
                  <Check className="size-4" />
                </span>
              )}
            </button>
          )}
          {filtered.map((code) => (
            <button
              key={code}
              type="button"
              className={cn(
                "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                value === code && "bg-accent"
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                setInputValue(code);
                onValueChange(code);
                setOpen(false);
                inputRef.current?.blur();
              }}
            >
              {code}
              {value === code && (
                <span className="absolute right-2 flex size-4 items-center justify-center">
                  <Check className="size-4" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
