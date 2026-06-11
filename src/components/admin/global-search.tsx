"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  FileText,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  NAV_TARGETS,
  canSeeTarget,
  scoreTarget,
  type NavTarget,
} from "./admin-nav";

interface RegResult {
  id: string;
  confirmation_code: string;
  status: string;
  event_id: string;
  event_label: string | null;
  name: string;
  name_ko: string | null;
  people_count: number;
}

type FlatItem =
  | { kind: "page"; target: NavTarget }
  | { kind: "reg"; result: RegResult };

const MAX_PAGE_RESULTS = 7;

export function GlobalSearch({ permissions }: { permissions: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [regResults, setRegResults] = useState<RegResult[]>([]);
  const [loadingRegs, setLoadingRegs] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Pages the current admin is allowed to see.
  const visibleTargets = useMemo(
    () => NAV_TARGETS.filter((t) => canSeeTarget(t.permission, permissions)),
    [permissions]
  );

  // ⌘K / Ctrl+K opens the palette from anywhere in the admin panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset transient state whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setRegResults([]);
      setActive(0);
    }
  }, [open]);

  // Debounced registration lookup (server-side) for queries ≥ 2 chars.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRegResults([]);
      setLoadingRegs(false);
      return;
    }
    setLoadingRegs(true);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setRegResults(Array.isArray(data.results) ? data.results : []);
        }
      } catch {
        /* aborted or network error — ignore */
      } finally {
        setLoadingRegs(false);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [query]);

  // Matching pages, ranked. With no query, show a short jump list.
  const pageMatches = useMemo(() => {
    const q = query.trim();
    if (!q) return visibleTargets.slice(0, MAX_PAGE_RESULTS);
    return visibleTargets
      .map((t) => ({ t, s: scoreTarget(t, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_PAGE_RESULTS)
      .map((x) => x.t);
  }, [query, visibleTargets]);

  // Flat list backing keyboard navigation (pages first, then registrations).
  const items = useMemo<FlatItem[]>(
    () => [
      ...pageMatches.map((target) => ({ kind: "page" as const, target })),
      ...regResults.map((result) => ({ kind: "reg" as const, result })),
    ],
    [pageMatches, regResults]
  );

  // Keep the active index in range as results change.
  useEffect(() => {
    setActive((a) => (items.length === 0 ? 0 : Math.min(a, items.length - 1)));
  }, [items.length]);

  const select = useCallback(
    (item: FlatItem) => {
      if (item.kind === "page") {
        router.push(item.target.href);
      } else {
        router.push(
          `/admin/registrations?view=${item.result.id}&event=${item.result.event_id}`
        );
      }
      setOpen(false);
    },
    [router]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (items.length ? (a + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[active];
      if (item) select(item);
    }
  };

  // Scroll the active row into view during keyboard navigation.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${active}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const showEmpty =
    query.trim().length >= 2 && !loadingRegs && items.length === 0;

  return (
    <>
      {/* Header trigger — looks like a search box, opens the palette. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-xs items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
        aria-label="Open search"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden items-center gap-0.5 rounded border bg-background px-1.5 font-mono text-[10px] sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 [&>button]:hidden">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <div onKeyDown={onKeyDown}>
            {/* Search field */}
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages, names, codes, phone…"
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {loadingRegs && (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
              {pageMatches.length > 0 && (
                <Section label={query.trim() ? "Pages" : "Jump to"}>
                  {pageMatches.map((target, i) => {
                    const idx = i;
                    const Icon = target.icon;
                    return (
                      <Row
                        key={target.href}
                        index={idx}
                        active={active === idx}
                        onHover={() => setActive(idx)}
                        onClick={() => select({ kind: "page", target })}
                      >
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{target.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {target.group}
                        </span>
                      </Row>
                    );
                  })}
                </Section>
              )}

              {regResults.length > 0 && (
                <Section label="Registrations">
                  {regResults.map((result, i) => {
                    const idx = pageMatches.length + i;
                    return (
                      <Row
                        key={result.id}
                        index={idx}
                        active={active === idx}
                        onHover={() => setActive(idx)}
                        onClick={() => select({ kind: "reg", result })}
                      >
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">
                            {result.name}
                            {result.name_ko ? (
                              <span className="ml-1.5 text-muted-foreground">
                                {result.name_ko}
                              </span>
                            ) : null}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {result.confirmation_code}
                            {result.event_label ? ` · ${result.event_label}` : ""}
                          </span>
                        </div>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                          {result.status}
                        </span>
                      </Row>
                    );
                  })}
                </Section>
              )}

              {showEmpty && (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No results for “{query.trim()}”.
                </p>
              )}

              {!query.trim() && (
                <p className="px-3 pb-2 pt-1 text-center text-[11px] text-muted-foreground">
                  Type a name, registration code, or phone number to find a
                  registration.
                </p>
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <ArrowUp className="size-3" />
                <ArrowDown className="size-3" />
                navigate
              </span>
              <span className="flex items-center gap-1">
                <CornerDownLeft className="size-3" />
                open
              </span>
              <span className="ml-auto">esc to close</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function Row({
  index,
  active,
  onHover,
  onClick,
  children,
}: {
  index: number;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-index={index}
      onMouseMove={onHover}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
      )}
    >
      {children}
    </button>
  );
}
