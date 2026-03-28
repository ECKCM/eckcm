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
import { useI18n } from "@/lib/i18n/context";

interface Church {
  id: string;
  name_en: string;
  name_ko: string | null;
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
  placeholder,
  className,
}: ChurchComboboxProps) {
  const { t } = useI18n();
  const sorted = useMemo(
    () =>
      [...churches].sort((a, b) => {
        if (a.is_other) return -1;
        if (b.is_other) return 1;
        return a.name_en.localeCompare(b.name_en);
      }),
    [churches]
  );

  const displayLabel = (c: Church) =>
    c.name_ko ? `${c.name_en} (${c.name_ko})` : c.name_en;

  const labels = useMemo(() => sorted.map(displayLabel), [sorted]);
  const selected = churches.find((c) => c.id === value);

  return (
    <Combobox
      value={selected ? displayLabel(selected) : null}
      onValueChange={(label) => {
        const church = sorted.find((c) => displayLabel(c) === label);
        onValueChange(church?.id ?? "");
      }}
      items={labels}
    >
      <ComboboxInput
        placeholder={placeholder ?? t("profile.selectChurch")}
        className={cn(className, error && "border-destructive")}
      />
      <ComboboxContent>
        <ComboboxEmpty>{t("profile.noChurchFound")}</ComboboxEmpty>
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
