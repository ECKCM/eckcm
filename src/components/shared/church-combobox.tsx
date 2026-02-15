"use client";

import { useMemo } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

interface Church {
  id: string;
  name_en: string;
  is_other: boolean;
}

interface ChurchComboboxProps {
  churches: Church[];
  value: string;
  onValueChange: (value: string) => void;
  error?: boolean;
  placeholder?: string;
  className?: string;
}

export function ChurchCombobox({
  churches,
  value,
  onValueChange,
  error,
  placeholder = "Select church",
  className,
}: ChurchComboboxProps) {
  const sorted = useMemo(
    () =>
      [...churches].sort((a, b) => {
        if (a.is_other) return -1;
        if (b.is_other) return 1;
        return a.name_en.localeCompare(b.name_en);
      }),
    [churches]
  );

  const names = useMemo(() => sorted.map((c) => c.name_en), [sorted]);
  const selected = churches.find((c) => c.id === value);

  return (
    <Combobox
      value={selected?.name_en ?? null}
      onValueChange={(name) => {
        const church = churches.find((c) => c.name_en === name);
        onValueChange(church?.id ?? "");
      }}
      items={names}
    >
      <ComboboxInput
        placeholder={placeholder}
        className={cn(className, error && "border-destructive")}
      />
      <ComboboxContent>
        <ComboboxEmpty>No church found.</ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
