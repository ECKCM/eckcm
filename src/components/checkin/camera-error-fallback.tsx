"use client";

import { Camera, CameraOff, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CameraPermissionStatus } from "@/lib/checkin/use-camera-permission";

interface CameraErrorFallbackProps {
  /** Current permission status from useCameraPermission hook */
  status: CameraPermissionStatus;
  /** Called to proceed — lets the Scanner mount which triggers the real browser prompt */
  onAllow: () => void;
}

export function CameraErrorFallback({
  status,
  onAllow,
}: CameraErrorFallbackProps) {
  if (status === "checking") {
    return (
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Checking camera permission...
        </p>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <CameraOff className="h-10 w-10 text-destructive" />
        <p className="text-sm font-medium">Camera access is blocked</p>
        <div className="text-xs text-muted-foreground max-w-[300px] space-y-1.5">
          <p>To enable camera, follow these steps:</p>
          <ol className="text-left list-decimal list-inside space-y-1">
            <li>
              Click the <strong>lock icon</strong> in the address bar
            </li>
            <li>
              Find <strong>Camera</strong> and set it to <strong>Allow</strong>
            </li>
            <li>Reload this page</li>
          </ol>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => window.location.reload()}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reload Page
        </Button>
      </div>
    );
  }

  // status === "prompt"
  return (
    <div className="flex flex-col items-center gap-3 p-6 text-center">
      <Camera className="h-10 w-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Camera access is required for QR scanning.
      </p>
      <Button size="sm" onClick={onAllow} className="gap-1.5">
        Grant Camera Access
      </Button>
    </div>
  );
}
