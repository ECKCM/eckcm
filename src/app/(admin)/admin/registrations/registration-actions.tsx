"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Eye,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { type RegistrationRow } from "./registrations-types";

interface LockInfo {
  userName: string;
}

interface RegistrationActionsProps {
  registration: RegistrationRow;
  onView: (reg: RegistrationRow) => void;
  onStatusChange: (regId: string, newStatus: string) => Promise<void>;
  updatingId: string | null;
  lockedBy?: LockInfo | null;
}

export function RegistrationActions({
  registration,
  onView,
  lockedBy,
}: RegistrationActionsProps) {
  const isLocked = !!lockedBy;
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <>
      <div className="flex items-center gap-1">
        {isLocked ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  disabled
                >
                  <Lock className="mr-1 size-3" />
                  Locked
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Being viewed by {lockedBy.userName}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowConfirm(true)}
          >
            <Eye className="mr-1 size-3" />
            View
          </Button>
        )}
      </div>

      {showConfirm && (
        <AlertDialog open onOpenChange={(open) => !open && setShowConfirm(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-amber-500" />
                Open Registration
              </AlertDialogTitle>
              <AlertDialogDescription>
                Open <strong>{registration.confirmation_code}</strong> ({registration.registrant_name})?
                This will lock it while you&apos;re viewing.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onView(registration);
                  setShowConfirm(false);
                }}
              >
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
