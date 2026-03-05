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
  last_seen_at: string;
}

interface AdminPresenceProps {
  currentUserId: string;
  currentUserEmail: string;
  currentUserName: string;
}

const AVATAR_COLORS = [
  "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-green-500",
  "bg-teal-500", "bg-blue-500", "bg-indigo-500", "bg-violet-500",
  "bg-pink-500", "bg-rose-500",
];

const STALE_THRESHOLD_MS = 2 * 60 * 1000;   // 2 min
const HEARTBEAT_INTERVAL_MS = 30 * 1000;     // 30 s

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
  // Start with current user immediately — never show empty
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([{
    user_id: currentUserId,
    email: currentUserEmail,
    display_name: currentUserName,
    last_seen_at: new Date().toISOString(),
  }]);

  // Sequence counter to discard stale async results
  const loadSeqRef = useRef(0);
  // Debounce timer for rapid change events
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const upsertPresence = async () => {
      await supabase.from("eckcm_admin_presence").upsert(
        {
          user_id: currentUserId,
          email: currentUserEmail,
          display_name: currentUserName,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    };

    const loadPresence = async () => {
      // Take a snapshot of the current sequence before the async call
      const seq = ++loadSeqRef.current;

      const { data } = await supabase
        .from("eckcm_admin_presence")
        .select("user_id, email, display_name, last_seen_at")
        .order("last_seen_at", { ascending: true });

      // Discard if a newer load has already started
      if (seq !== loadSeqRef.current) return;

      if (data) {
        const online = data.filter(
          (u) => Date.now() - new Date(u.last_seen_at).getTime() < STALE_THRESHOLD_MS
        );
        // Always ensure current user is in the list (optimistic)
        const hasself = online.some((u) => u.user_id === currentUserId);
        if (!hasself) {
          online.unshift({
            user_id: currentUserId,
            email: currentUserEmail,
            display_name: currentUserName,
            last_seen_at: new Date().toISOString(),
          });
        }
        setActiveUsers(online);
      }
    };

    // Debounced load — collapses rapid change events into a single fetch
    const debouncedLoad = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(loadPresence, 300);
    };

    // Register self immediately, then load full list
    upsertPresence().then(() => loadPresence());

    // Heartbeat — keep own record alive
    const heartbeat = setInterval(upsertPresence, HEARTBEAT_INTERVAL_MS);

    // Periodic stale sweep — catches crashed browsers that couldn't delete their record
    const staleSweep = setInterval(loadPresence, HEARTBEAT_INTERVAL_MS);

    // Subscribe to all changes on the presence table
    const channel = supabase
      .channel("eckcm_admin_presence_changes")
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "eckcm_admin_presence" },
        debouncedLoad
      )
      .subscribe();

    // Remove own record on tab close
    const handleUnload = () => {
      supabase.from("eckcm_admin_presence").delete().eq("user_id", currentUserId).then(() => {});
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(heartbeat);
      clearInterval(staleSweep);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      window.removeEventListener("beforeunload", handleUnload);
      supabase
        .from("eckcm_admin_presence")
        .delete()
        .eq("user_id", currentUserId)
        .then(() => supabase.removeChannel(channel));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  const sorted = [...activeUsers].sort((a, b) => {
    if (a.user_id === currentUserId) return -1;
    if (b.user_id === currentUserId) return 1;
    return a.last_seen_at.localeCompare(b.last_seen_at);
  });

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center">
        {sorted.map((user, index) => {
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
                  style={{ zIndex: 10 + sorted.length - index }}
                >
                  {initials}
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full ring-1 ring-background" />
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
        {sorted.length > 1 && (
          <span className="ml-2 text-xs text-muted-foreground whitespace-nowrap">
            {sorted.length} online
          </span>
        )}
      </div>
    </TooltipProvider>
  );
}
