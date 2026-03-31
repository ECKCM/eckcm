"use client";

import { useState, useMemo } from "react";

export type SortDirection = "asc" | "desc" | null;

export interface SortConfig {
  key: string;
  direction: SortDirection;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function compareValues(a: unknown, b: unknown, direction: "asc" | "desc"): number {
  // nulls/undefined always go to the end
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  const mult = direction === "asc" ? 1 : -1;

  // booleans
  if (typeof a === "boolean" && typeof b === "boolean") {
    return (Number(a) - Number(b)) * mult;
  }

  // numbers
  if (typeof a === "number" && typeof b === "number") {
    return (a - b) * mult;
  }

  // try numeric comparison for string numbers
  const aStr = String(a);
  const bStr = String(b);

  const aNum = Number(aStr);
  const bNum = Number(bStr);
  if (!isNaN(aNum) && !isNaN(bNum) && aStr !== "" && bStr !== "") {
    return (aNum - bNum) * mult;
  }

  // date strings (ISO format or date-like)
  const aDate = Date.parse(aStr);
  const bDate = Date.parse(bStr);
  if (!isNaN(aDate) && !isNaN(bDate) && aStr.length > 6) {
    return (aDate - bDate) * mult;
  }

  // string comparison
  return aStr.localeCompare(bStr, undefined, { sensitivity: "base" }) * mult;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useTableSort<T extends Record<string, any>>(
  data: T[],
  defaultSort?: SortConfig,
) {
  const [sortConfig, setSortConfig] = useState<SortConfig>(
    defaultSort ?? { key: "", direction: null },
  );

  const requestSort = (key: string) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        if (prev.direction === "asc") return { key, direction: "desc" as const };
        if (prev.direction === "desc") return { key: "", direction: null };
      }
      return { key, direction: "asc" as const };
    });
  };

  const sortedData = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return data;
    return [...data].sort((a, b) => {
      const aVal = getNestedValue(a, sortConfig.key);
      const bVal = getNestedValue(b, sortConfig.key);
      return compareValues(aVal, bVal, sortConfig.direction!);
    });
  }, [data, sortConfig]);

  return { sortedData, sortConfig, requestSort };
}
