"use client";

import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";

export interface SearchableParticipant {
  participantCode: string;
  name: string;
  koreanName: string | null;
  email: string | null;
  phone: string | null;
  confirmationCode: string;
  registrationStatus: string;
}

interface ParticipantSearchProps {
  participants: SearchableParticipant[];
  /** Called with the chosen participant code — runs the same check-in flow. */
  onSelect: (participantCode: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

const MAX_RESULTS = 8;

function digits(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Manual check-in by SEARCH, not just code. Type a name (English or Korean),
 * phone, email, reg code, or participant code and pick from the dropdown — the
 * selection runs the exact same check-in flow as a camera scan.
 *
 * Filtering is fully client-side over the event roster (loaded once), so it's
 * instant and works offline once the roster is in memory.
 */
export function ParticipantSearch({
  participants,
  onSelect,
  disabled,
  loading,
}: ParticipantSearchProps) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const results = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (ql.length < 1) return [];
    const qd = digits(q);
    return participants
      .filter((p) => {
        if (p.name.toLowerCase().includes(ql)) return true;
        if ((p.koreanName ?? "").toLowerCase().includes(ql)) return true;
        if ((p.email ?? "").toLowerCase().includes(ql)) return true;
        if ((p.confirmationCode ?? "").toLowerCase().includes(ql)) return true;
        if ((p.participantCode ?? "").toLowerCase().includes(ql)) return true;
        // Phone: compare digits-only so "010-1234" matches "01012345678".
        if (qd.length >= 3 && digits(p.phone ?? "").includes(qd)) return true;
        return false;
      })
      .slice(0, MAX_RESULTS);
  }, [participants, q]);

  const pick = (code: string) => {
    onSelect(code);
    setQ("");
    setOpen(false);
  };

  const showNoMatch =
    open && q.trim().length >= 1 && results.length === 0 && !loading;

  return (
    <div className="relative">
      <div className="relative">
        {loading ? (
          <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        )}
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so an option's onClick lands before the list unmounts.
            blurTimer.current = setTimeout(() => setOpen(false), 150);
          }}
          placeholder={
            loading
              ? "Loading roster…"
              : "Search name, phone, email, or reg code…"
          }
          disabled={disabled}
          className="pl-8"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-auto rounded-md border bg-popover shadow-md max-h-72">
          {results.map((p) => (
            <button
              key={p.participantCode}
              type="button"
              // Prevent the input's blur from firing before the click.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p.participantCode)}
              className="flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/60"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-bold">
                  {p.confirmationCode}
                </span>
                <span className="text-sm">{p.name}</span>
                {p.koreanName && (
                  <span className="text-sm text-muted-foreground">
                    {p.koreanName}
                  </span>
                )}
              </div>
              {(p.phone || p.email) && (
                <div className="text-xs text-muted-foreground truncate max-w-full">
                  {[p.phone, p.email].filter(Boolean).join(" · ")}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {showNoMatch && (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
          No match for &ldquo;{q.trim()}&rdquo;
        </div>
      )}
    </div>
  );
}
