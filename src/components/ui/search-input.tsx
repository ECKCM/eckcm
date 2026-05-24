"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

interface SearchInputProps
  extends Omit<React.ComponentProps<"input">, "onChange" | "value"> {
  value: string;
  onValueChange: (value: string) => void;
  containerClassName?: string;
  clearAriaLabel?: string;
  showIcon?: boolean;
}

export function SearchInput({
  value,
  onValueChange,
  containerClassName,
  clearAriaLabel = "Clear search",
  showIcon = true,
  placeholder,
  className,
  ...inputProps
}: SearchInputProps) {
  return (
    <InputGroup className={cn(containerClassName)}>
      {showIcon ? (
        <InputGroupAddon>
          <Search className="size-4" />
        </InputGroupAddon>
      ) : null}
      <InputGroupInput
        {...inputProps}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={className}
      />
      {value ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="button"
            size="icon-xs"
            aria-label={clearAriaLabel}
            onClick={() => onValueChange("")}
          >
            <X className="size-3.5" />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
