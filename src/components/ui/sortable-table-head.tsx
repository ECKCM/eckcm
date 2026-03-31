"use client";

import * as React from "react";
import { TableHead } from "@/components/ui/table";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { type SortConfig } from "@/lib/hooks/use-table-sort";

interface SortableTableHeadProps
  extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortKey: string;
  sortConfig: SortConfig;
  onSort: (key: string) => void;
}

export function SortableTableHead({
  sortKey,
  sortConfig,
  onSort,
  children,
  className,
  ...props
}: SortableTableHeadProps) {
  const isActive = sortConfig.key === sortKey;
  const direction = isActive ? sortConfig.direction : null;

  return (
    <TableHead
      className={cn("cursor-pointer select-none hover:bg-muted/50", className)}
      onClick={() => onSort(sortKey)}
      {...props}
    >
      <div className="flex items-center gap-1">
        {children}
        {direction === "asc" ? (
          <ArrowUp className="size-3 shrink-0" />
        ) : direction === "desc" ? (
          <ArrowDown className="size-3 shrink-0" />
        ) : (
          <ArrowUpDown className="size-3 shrink-0 opacity-30" />
        )}
      </div>
    </TableHead>
  );
}
