"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Admin "privacy mode" for monetary figures.
 *
 * A single browser-local toggle that hides every dollar amount across the admin
 * panel (registration summary cards, the Amount column, the dashboard revenue
 * tiles, …) so an admin can screen-share or work in public without exposing the
 * church's finances. It is a convenience mask, NOT an access control — the data
 * is still fetched; only its display is replaced with a placeholder.
 *
 * Persistence: localStorage, per browser. Default = visible (money shown).
 *
 * Hydration: server and the first client render always report `mounted: false`,
 * so consumers render the *visible* state on both, avoiding a mismatch. The
 * stored preference is applied one frame later in an effect.
 */

const STORAGE_KEY = "eckcm.admin.moneyHidden";

interface MoneyVisibilityContextType {
  /** True when monetary figures should be masked. */
  hidden: boolean;
  /** Becomes true after the client has read the stored preference. */
  mounted: boolean;
  toggle: () => void;
  setHidden: (v: boolean) => void;
}

const MoneyVisibilityContext = createContext<MoneyVisibilityContextType>({
  hidden: false,
  mounted: false,
  toggle: () => {},
  setHidden: () => {},
});

export function MoneyVisibilityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [hidden, setHiddenState] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Apply the stored preference after mount (client only).
  useEffect(() => {
    try {
      setHiddenState(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* localStorage unavailable — stay visible */
    }
    setMounted(true);
  }, []);

  const setHidden = useCallback((v: boolean) => {
    setHiddenState(v);
    try {
      window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* ignore persistence failure */
    }
  }, []);

  const toggle = useCallback(() => setHidden(!hidden), [hidden, setHidden]);

  const value = useMemo(
    () => ({ hidden, mounted, toggle, setHidden }),
    [hidden, mounted, toggle, setHidden]
  );

  return (
    <MoneyVisibilityContext.Provider value={value}>
      {children}
    </MoneyVisibilityContext.Provider>
  );
}

export function useMoneyVisibility(): MoneyVisibilityContextType {
  return useContext(MoneyVisibilityContext);
}

/**
 * Wraps an already-formatted money figure. Renders its children normally, but
 * swaps in a neutral mask once the admin has enabled privacy mode. Callers keep
 * their own formatting:  <MoneyValue>{formatMoney(cents)}</MoneyValue>
 */
export function MoneyValue({
  children,
  mask = "••••",
  className,
}: {
  children: React.ReactNode;
  mask?: string;
  className?: string;
}) {
  const { hidden, mounted } = useMoneyVisibility();
  // Visible on the server and the first client paint → no hydration mismatch.
  if (!mounted || !hidden) return <>{children}</>;
  return (
    <span
      aria-label="hidden"
      className={cn("select-none tracking-widest text-muted-foreground", className)}
    >
      {mask}
    </span>
  );
}

/**
 * Header button that flips privacy mode. Renders the "visible" (Eye) state until
 * mounted so it matches the server-rendered markup.
 */
export function MoneyToggle({ className }: { className?: string }) {
  const { hidden, mounted, toggle } = useMoneyVisibility();
  const isHidden = mounted && hidden;
  return (
    <button
      type="button"
      onClick={toggle}
      title={isHidden ? "Show money" : "Hide money"}
      aria-label={isHidden ? "Show monetary figures" : "Hide monetary figures"}
      aria-pressed={isHidden}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className
      )}
    >
      {isHidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
}
