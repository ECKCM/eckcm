"use client";

import { useMemo } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSelectTrigger,
  ComboboxValue,
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

/**
 * Church picker. Renders as a Select-style trigger button that opens a popup
 * with the search field pinned at the top and the church list below it.
 *
 * This "input inside popup" shape (rather than a plain text-input combobox) is
 * what makes it work on mobile: tapping the trigger opens the popup WITHOUT
 * focusing the search field, so the soft keyboard doesn't pop up and bury the
 * list. Users can scroll to pick, or tap the search box to filter — and because
 * the search box sits at the top of the popup, it stays above the keyboard.
 * Previously the input itself was the trigger, so tapping it raised the keyboard
 * and covered the anchored dropdown, making churches un-selectable on phones.
 */
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
      <ComboboxSelectTrigger
        className={cn(className, error && "border-destructive")}
      >
        <ComboboxValue placeholder={placeholder ?? t("profile.selectChurch")} />
      </ComboboxSelectTrigger>
      <ComboboxContent>
        <div className="bg-popover sticky top-0 z-10 border-b p-1">
          <ComboboxInput
            showTrigger={false}
            placeholder={t("profile.searchChurch")}
            className="w-full border-0 bg-transparent shadow-none"
          />
        </div>
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
