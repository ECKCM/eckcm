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
import { Users } from "lucide-react";

interface PresenceUser {
  user_id: string;
  email: string;
  display_name: string;
  last_seen_at: string;
  last_active_at: string;
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

const STALE_THRESHOLD_MS = 2 * 60 * 1000;   // 2 min — older than this = offline
const IDLE_THRESHOLD_MS = 10 * 60 * 1000;    // 10 min — no interaction = idle (yellow)
const HEARTBEAT_INTERVAL_MS = 30 * 1000;     // 30 s

function isIdle(user: PresenceUser): boolean {
  const lastActive = new Date(user.last_active_at ?? user.last_seen_at).getTime();
  if (Number.isNaN(lastActive)) return false;
  return Date.now() - lastActive > IDLE_THRESHOLD_MS;
}

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
    last_active_at: new Date().toISOString(),
  }]);

  const loadSeqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  // Re-render tick so derived idle state refreshes even when the data is stable.
  const [, setTick] = useState(0);

  useEffect(() => {
    const supabase = createClient();

    // Track real interaction so we can tell "tab open but idle" apart from
    // "actively working". The heartbeat below stamps last_active_at from this.
    const markActive = () => {
      lastActivityRef.current = Date.now();
    };
    const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, markActive, { passive: true })
    );

    const upsertPresence = async () => {
      await supabase.from("eckcm_admin_presence").upsert(
        {
          user_id: currentUserId,
          email: currentUserEmail,
          display_name: currentUserName,
          last_seen_at: new Date().toISOString(),
          last_active_at: new Date(lastActivityRef.current).toISOString(),
        },
        { onConflict: "user_id" }
      );
    };

    const loadPresence = async () => {
      const seq = ++loadSeqRef.current;

      const { data } = await supabase
        .from("eckcm_admin_presence")
        .select("user_id, email, display_name, last_seen_at, last_active_at")
        .order("last_seen_at", { ascending: true });

      if (seq !== loadSeqRef.current) return;

      if (data) {
        const online = (data as PresenceUser[]).filter(
          (u) => Date.now() - new Date(u.last_seen_at).getTime() < STALE_THRESHOLD_MS
        );
        const hasself = online.some((u) => u.user_id === currentUserId);
        if (!hasself) {
          online.unshift({
            user_id: currentUserId,
            email: currentUserEmail,
            display_name: currentUserName,
            last_seen_at: new Date().toISOString(),
            last_active_at: new Date(lastActivityRef.current).toISOString(),
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
    // Recompute derived idle state on a steady tick even if presence data
    // hasn't changed (so green → yellow flips once the threshold passes).
    const idleTick = setInterval(() => setTick((t) => t + 1), HEARTBEAT_INTERVAL_MS);

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
      clearInterval(idleTick);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActive));
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

  const count = sorted.length;
  const idleCount = sorted.filter(isIdle).length;
  const countLabel = idleCount > 0 ? `${count} online · ${idleCount} idle` : `${count} online`;
  const ariaLabel =
    idleCount > 0
      ? `${count} admin${count === 1 ? "" : "s"} online, ${idleCount} idle`
      : `${count} admin${count === 1 ? "" : "s"} online`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2 text-xs text-muted-foreground"
          aria-label={ariaLabel}
        >
          {countLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>{countLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-72 overflow-y-auto">
          {sorted.map((user) => {
            const isCurrentUser = user.user_id === currentUserId;
            const initials = getInitials(user.display_name);
            const colorClass = getAvatarColor(user.user_id);
            const idle = isIdle(user);
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
                  <span
                    className={[
                      "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-background",
                      idle ? "bg-yellow-400" : "bg-green-400",
                    ].join(" ")}
                    title={idle ? "Idle" : "Active"}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium leading-tight">
                    {user.display_name}
                    {isCurrentUser && (
                      <span className="ml-1 text-xs text-green-600">(You)</span>
                    )}
                    {idle && (
                      <span className="ml-1 text-xs text-yellow-600">idle</span>
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
