"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRegistration } from "@/lib/context/registration-context";

/**
 * Maps registration sub-paths to wizard step numbers.
 * Pages not listed (e.g. /confirmation) are excluded from the guard.
 */
const STEP_ROUTES: Record<string, number> = {
  "": 1, // /register/[eventId]
  "/instructions": 2,
  "/participants": 3,
  "/lodging": 4,
  "/key-deposit": 5,
  "/airport-pickup": 6,
  "/review": 7,
  "/payment": 8,
};

const STEP_TO_ROUTE: Record<number, string> = Object.fromEntries(
  Object.entries(STEP_ROUTES).map(([route, step]) => [step, route]),
);

/**
 * Centralized step guard for the registration wizard.
 *
 * - Syncs state.step DOWN when the user navigates backward (browser back, etc.)
 * - Blocks forward jumps (URL step > state.step) by redirecting to the current step
 * - Pages outside the wizard (e.g. /confirmation) pass through unguarded
 */
export function RegistrationGuard({
  eventId,
  children,
}: {
  eventId: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, dispatch, hydrated } = useRegistration();

  const basePath = `/register/${eventId}`;
  const subPath = pathname.startsWith(basePath)
    ? pathname.slice(basePath.length)
    : "";
  const urlStep = STEP_ROUTES[subPath];

  // Redirect to dashboard on actual page reload (refresh / F5).
  // beforeunload fires only on real page unloads, never on SPA navigations.
  useEffect(() => {
    const flag = sessionStorage.getItem("registration_refreshed");
    if (flag) {
      sessionStorage.removeItem("registration_refreshed");
      router.replace("/dashboard");
      return;
    }

    const handleBeforeUnload = () => {
      sessionStorage.setItem("registration_refreshed", "1");
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [router]);

  useEffect(() => {
    if (!hydrated || urlStep === undefined) return;

    // Back navigation detected — sync state.step down so the user
    // must re-progress through each step (re-validating data).
    if (urlStep < state.step) {
      dispatch({ type: "SET_STEP", step: urlStep });
    }

    // Forward jump detected — redirect to the current valid step.
    if (urlStep > state.step) {
      const route = STEP_TO_ROUTE[state.step] ?? "";
      router.replace(`${basePath}${route}`);
    }
    // Only react to URL (pathname) changes — not state.step changes.
    // Including state.step would cause a race: handleNext() sets step=2
    // while still on the step-1 URL, triggering the "back nav" branch
    // which resets step to 1 before router.push completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, urlStep]);

  // Don't render until context is hydrated from sessionStorage
  if (!hydrated) return null;

  // Block rendering while redirecting away from a forward-jump
  if (urlStep !== undefined && urlStep > state.step) return null;

  return <>{children}</>;
}
