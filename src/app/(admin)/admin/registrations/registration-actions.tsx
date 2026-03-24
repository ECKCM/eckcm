"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  MoreHorizontal,
  Eye,
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  RefreshCcw,
  FileText,
  Send,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { type RegistrationRow, VALID_STATUSES } from "./registrations-types";

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

const statusIcons: Record<string, React.ReactNode> = {
  PAID: <CheckCircle2 className="size-4 text-green-600" />,
  APPROVED: <CheckCircle2 className="size-4 text-emerald-600" />,
  SUBMITTED: <Send className="size-4 text-blue-600" />,
  DRAFT: <FileText className="size-4" />,
  CANCELLED: <XCircle className="size-4 text-destructive" />,
  REFUNDED: <RefreshCcw className="size-4 text-destructive" />,
};

type PendingAction =
  | { type: "view" }
  | { type: "status"; status: string };

export function RegistrationActions({
  registration,
  onView,
  onStatusChange,
  updatingId,
  lockedBy,
}: RegistrationActionsProps) {
  const isUpdating = updatingId === registration.id;
  const isLocked = !!lockedBy;
  const [pending, setPending] = useState<PendingAction | null>(null);

  const confirmAction = () => {
    if (!pending) return;
    if (pending.type === "view") {
      onView(registration);
    } else {
      onStatusChange(registration.id, pending.status);
    }
    setPending(null);
  };

  const isDestructive =
    pending?.type === "status" &&
    (pending.status === "CANCELLED" || pending.status === "REFUNDED");

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
            onClick={() => setPending({ type: "view" })}
          >
            <Eye className="mr-1 size-3" />
            View
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={isUpdating || isLocked}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => setPending({ type: "view" })}
              disabled={isLocked}
            >
              <Eye className="mr-2 size-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={isLocked}>
                <ArrowRightLeft className="mr-2 size-4" />
                Change Status
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {VALID_STATUSES.filter((s) => s !== registration.status).map(
                  (s) => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => setPending({ type: "status", status: s })}
                      className={
                        s === "CANCELLED" || s === "REFUNDED"
                          ? "text-destructive focus:text-destructive"
                          : ""
                      }
                    >
                      {statusIcons[s]}
                      <span className="ml-2">{s}</span>
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {pending && (
        <AlertDialog open onOpenChange={(open) => !open && setPending(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {isDestructive ? (
                  <AlertTriangle className="size-5 text-destructive" />
                ) : (
                  <AlertTriangle className="size-5 text-amber-500" />
                )}
                {pending.type === "view"
                  ? "Open Registration"
                  : `Change Status to ${pending.status}`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pending.type === "view" ? (
                  <>
                    Open <strong>{registration.confirmation_code}</strong> ({registration.registrant_name})?
                    This will lock it while you&apos;re viewing.
                  </>
                ) : isDestructive ? (
                  <>
                    Are you sure you want to change{" "}
                    <strong>{registration.confirmation_code}</strong> ({registration.registrant_name})
                    {" "}to <strong>{pending.status}</strong>?
                    {pending.status === "CANCELLED" && " This will deactivate all E-Pass tokens."}
                  </>
                ) : (
                  <>
                    Change <strong>{registration.confirmation_code}</strong> ({registration.registrant_name})
                    {" "}from <strong>{registration.status}</strong> to <strong>{pending.status}</strong>?
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={
                  isDestructive
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/70 active:scale-[0.97]"
                    : ""
                }
                onClick={confirmAction}
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
