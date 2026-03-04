"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PresenceUser {
  user_id: string;
  email: string;
  display_name: string;
  online_at: string;
}

interface AdminPresenceProps {
  currentUserId: string;
  currentUserEmail: string;
  currentUserName: string;
}

const AVATAR_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-green-500",
  "bg-teal-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-pink-500",
  "bg-rose-500",
];

function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0][0] ?? "?").toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AdminPresence({
  currentUserId,
  currentUserEmail,
  currentUserName,
}: AdminPresenceProps) {
  const selfRef = useRef<PresenceUser>({
    user_id: currentUserId,
    email: currentUserEmail,
    display_name: currentUserName,
    online_at: "",
  });

  // Always start with current user — never empty
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([selfRef.current]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("admin-presence", {
      config: { presence: { key: currentUserId } },
    });

    const syncUsers = () => {
      const state = channel.presenceState<PresenceUser>();
      const map = new Map<string, PresenceUser>();

      // Always keep self in the list
      map.set(currentUserId, selfRef.current);

      for (const presences of Object.values(state)) {
        if (presences.length > 0) {
          const p = presences[0];
          map.set(p.user_id, p);
        }
      }

      const users = Array.from(map.values()).sort((a, b) => {
        if (a.user_id === currentUserId) return -1;
        if (b.user_id === currentUserId) return 1;
        return a.online_at.localeCompare(b.online_at);
      });

      setActiveUsers(users);
    };

    channel
      .on("presence", { event: "sync" }, syncUsers)
      .on("presence", { event: "join" }, syncUsers)
      .on("presence", { event: "leave" }, syncUsers)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          selfRef.current = {
            ...selfRef.current,
            online_at: new Date().toISOString(),
          };
          await channel.track(selfRef.current);
        }
      });

    return () => {
      channel.untrack().then(() => supabase.removeChannel(channel));
    };
  }, [currentUserId, currentUserEmail, currentUserName]);

  return (
    <TooltipProvider delayDuration={200}>
      {/* No gap — use only ml on each avatar for clean stacking */}
      <div className="flex items-center">
        {activeUsers.map((user, index) => {
          const isCurrentUser = user.user_id === currentUserId;
          const initials = getInitials(user.display_name);
          const colorClass = getAvatarColor(user.user_id);

          return (
            <Tooltip key={user.user_id}>
              <TooltipTrigger asChild>
                <div
                  className={[
                    "relative flex items-center justify-center",
                    "w-8 h-8 rounded-full text-white text-xs font-bold",
                    "cursor-default select-none shrink-0",
                    "ring-2 ring-background",
                    colorClass,
                    index > 0 ? "-ml-2" : "",
                  ].join(" ")}
                  style={{ zIndex: 10 + activeUsers.length - index }}
                >
                  {initials}
                  {isCurrentUser && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full ring-1 ring-background" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <p className="font-medium">{user.display_name}</p>
                <p className="text-muted-foreground">{user.email}</p>
                {isCurrentUser && <p className="text-green-500 font-medium">You</p>}
              </TooltipContent>
            </Tooltip>
          );
        })}
        {activeUsers.length > 1 && (
          <span className="ml-2 text-xs text-muted-foreground whitespace-nowrap">
            {activeUsers.length} online
          </span>
        )}
      </div>
    </TooltipProvider>
  );
}
