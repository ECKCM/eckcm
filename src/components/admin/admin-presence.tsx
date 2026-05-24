"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Users } from "lucide-react";

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
const MAX_AVATAR_STACK = 3;

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
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([{
    user_id: currentUserId,
    email: currentUserEmail,
    display_name: currentUserName,
    last_seen_at: new Date().toISOString(),
  }]);
  const [open, setOpen] = useState(false);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSeqRef = useRef(0);
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
      const seq = ++loadSeqRef.current;

      const { data } = await supabase
        .from("eckcm_admin_presence")
        .select("user_id, email, display_name, last_seen_at")
        .order("last_seen_at", { ascending: true });

      if (seq !== loadSeqRef.current) return;

      if (data) {
        const online = data.filter(
          (u) => Date.now() - new Date(u.last_seen_at).getTime() < STALE_THRESHOLD_MS
        );
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

    const debouncedLoad = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(loadPresence, 300);
    };

    upsertPresence().then(() => loadPresence());

    const heartbeat = setInterval(upsertPresence, HEARTBEAT_INTERVAL_MS);
    const staleSweep = setInterval(loadPresence, HEARTBEAT_INTERVAL_MS);

    const channel = supabase
      .channel("eckcm_admin_presence_changes")
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "eckcm_admin_presence" },
        debouncedLoad
      )
      .subscribe();

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

  const stacked = sorted.slice(0, MAX_AVATAR_STACK);
  const extra = Math.max(0, sorted.length - MAX_AVATAR_STACK);
  const count = sorted.length;

  const handleEnter = () => {
    if (hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
    setOpen(true);
  };

  const handleLeave = () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 px-2"
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          aria-label={`${count} admin${count === 1 ? "" : "s"} online`}
        >
          <div className="flex items-center -space-x-2">
            {stacked.map((user, index) => {
              const colorClass = getAvatarColor(user.user_id);
              const initials = getInitials(user.display_name);
              return (
                <div
                  key={user.user_id}
                  className={[
                    "relative flex items-center justify-center",
                    "w-6 h-6 rounded-full text-white text-[10px] font-bold",
                    "ring-2 ring-background select-none shrink-0",
                    colorClass,
                  ].join(" ")}
                  style={{ zIndex: 10 + stacked.length - index }}
                >
                  {initials}
                </div>
              );
            })}
            {extra > 0 && (
              <div
                className="relative flex items-center justify-center w-6 h-6 rounded-full bg-muted text-foreground text-[10px] font-bold ring-2 ring-background select-none shrink-0"
                style={{ zIndex: 9 }}
              >
                +{extra}
              </div>
            )}
          </div>
          <span className="hidden sm:inline text-xs text-muted-foreground">
            {count} online
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <DropdownMenuLabel className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>{count} admin{count === 1 ? "" : "s"} online</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-72 overflow-y-auto">
          {sorted.map((user) => {
            const isCurrentUser = user.user_id === currentUserId;
            const initials = getInitials(user.display_name);
            const colorClass = getAvatarColor(user.user_id);
            return (
              <div
                key={user.user_id}
                className="flex items-center gap-2 px-2 py-1.5 text-sm"
              >
                <div
                  className={[
                    "relative flex items-center justify-center shrink-0",
                    "w-7 h-7 rounded-full text-white text-[11px] font-bold",
                    colorClass,
                  ].join(" ")}
                >
                  {initials}
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full ring-1 ring-background" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium leading-tight">
                    {user.display_name}
                    {isCurrentUser && (
                      <span className="ml-1 text-xs text-green-600">(You)</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground leading-tight">
                    {user.email}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
