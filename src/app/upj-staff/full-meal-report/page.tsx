import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { FullMealReportClient } from "./full-meal-report-client";

export const metadata: Metadata = {
  title: "Full Meal Report",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["UPJ_STAFF", "SUPER_ADMIN", "EVENT_ADMIN"]);

export default async function FullMealReportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/upj-staff/login");
  }

  const { data: assignments } = await supabase
    .from("eckcm_staff_assignments")
    .select("eckcm_roles(name)")
    .eq("user_id", user.id)
    .eq("is_active", true);
  const roleNames = (assignments ?? [])
    .map((a) => (a.eckcm_roles as unknown as { name: string } | null)?.name)
    .filter((name): name is string => Boolean(name));
  if (!roleNames.some((name) => ALLOWED_ROLES.has(name))) {
    redirect("/dashboard");
  }

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year, event_start_date, event_end_date")
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8 sm:py-10">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/upj-staff"
          aria-label="Back to UPJ dashboard"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Full Meal Report</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every day of the event by meal and age tier, with totals.
          </p>
        </div>
      </header>

      <FullMealReportClient
        events={(events ?? []).map((e) => ({
          id: e.id,
          name_en: e.name_en,
          year: e.year,
          startDate: e.event_start_date,
          endDate: e.event_end_date,
        }))}
      />
    </div>
  );
}
