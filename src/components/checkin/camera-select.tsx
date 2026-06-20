"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CameraDevice } from "@/lib/checkin/use-camera-devices";

interface CameraSelectProps {
  devices: CameraDevice[];
  value: string | null;
  onChange: (deviceId: string) => void;
  onRefresh?: () => void;
  className?: string;
}

function describeFacing(facing: CameraDevice["facing"]) {
  if (facing === "environment") return "Back";
  if (facing === "user") return "Front";
  return null;
}

export function CameraSelect({
  devices,
  value,
  onChange,
  onRefresh,
  className,
}: CameraSelectProps) {
  // Some browsers (notably iOS Safari before camera permission settles) return
  // devices with an empty deviceId. Radix's SelectItem forbids empty-string
  // values, and an unselectable camera is useless anyway, so drop them.
  const selectable = devices.filter((d) => d.deviceId !== "");

  if (selectable.length === 0) {
    return null;
  }

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <Camera className="h-4 w-4 text-muted-foreground shrink-0" />
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger className="w-full min-w-[180px]">
          <SelectValue placeholder="Select camera" />
        </SelectTrigger>
        <SelectContent>
          {selectable.map((d) => {
            const facing = describeFacing(d.facing);
            return (
              <SelectItem key={d.deviceId} value={d.deviceId}>
                {facing ? `${facing} · ` : ""}
                {d.label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {onRefresh && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          title="Refresh camera list"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
