"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** One registration match returned by /api/admin/search. */
export interface RegistrationSearchResult {
  id: string;
  confirmation_code: string;
  status: string;
  event_id: string;
  event_label: string | null;
  name: string;
  name_ko: string | null;
  people_count: number;
}

interface RegistrationComboboxProps {
  /** Called with the chosen registration (null when cleared). */
  onSelect: (result: RegistrationSearchResult | null) => void;
  /** Optional event scope passed through to the search API. */
  eventId?: string | null;
  placeholder?: string;
  className?: string;
}

/**
 * Searchable registration picker. Debounces the query against the admin search
 * API (confirmation code / name / email / phone) and lists ready-to-pick
 * matches. Server already filters, so base-ui's client-side filter is disabled
 * (`filter={null}`) — a code-only match never gets re-filtered out by the input
 * text. Selecting an item fires `onSelect` with the full result.
 */
export function RegistrationCombobox({
  onSelect,
  eventId,
  placeholder = "Search by code, name, email, or phone…",
  className,
}: RegistrationComboboxProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RegistrationSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  // Bumped on each keystroke so a slow earlier request can't overwrite a newer one.
  const reqIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    async (term: string) => {
      const trimmed = term.trim();
      if (trimmed.length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }
      const reqId = ++reqIdRef.current;
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: trimmed });
        if (eventId) params.set("event", eventId);
        const res = await fetch(`/api/admin/search?${params.toString()}`);
        const data = await res.json();
        // Ignore stale responses.
        if (reqId !== reqIdRef.current) return;
        setResults(res.ok ? (data.results ?? []) : []);
      } catch {
        if (reqId === reqIdRef.current) setResults([]);
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    [eventId]
  );

  // Debounce the search as the input value changes.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const labelFor = (r: RegistrationSearchResult) =>
    `${r.name}${r.name_ko ? ` (${r.name_ko})` : ""} · ${r.confirmation_code}`;

  return (
    <Combobox<RegistrationSearchResult>
      items={results}
      filter={null}
      // Uncontrolled selection: the parent remounts this component (via `key`)
      // after each import to reset it, so re-selecting the same registration
      // still fires onValueChange. Passing a controlled `value` here would make
      // base-ui flip from uncontrolled→controlled on first interaction.
      itemToStringLabel={labelFor}
      onValueChange={(value) => onSelect(value)}
      onInputValueChange={(value) => setQuery(value)}
    >
      <ComboboxInput placeholder={placeholder} className={className} />
      <ComboboxContent>
        <ComboboxEmpty>
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Searching…
            </span>
          ) : query.trim().length < 2 ? (
            "Type at least 2 characters"
          ) : (
            "No registrations found"
          )}
        </ComboboxEmpty>
        <ComboboxList>
          {(item: RegistrationSearchResult) => (
            <ComboboxItem key={item.id} value={item}>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">
                  {item.name}
                  {item.name_ko ? (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      ({item.name_ko})
                    </span>
                  ) : null}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  <span className="font-mono">{item.confirmation_code}</span>
                  {" · "}
                  {item.status}
                  {item.people_count > 0
                    ? ` · ${item.people_count} ${
                        item.people_count === 1 ? "person" : "people"
                      }`
                    : ""}
                  {item.event_label ? ` · ${item.event_label}` : ""}
                </span>
              </div>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
