import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { MealScanCountsClient } from "./meal-scan-counts-client";

export const dynamic = "force-dynamic";

export default async function MealScanCountsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Mirror the sidebar gate (settings.manage) — editing reconciliation figures
  // is a settings-level action. Middleware has already set this header.
  const headersList = await headers();
  const rawPermissions = headersList.get("x-user-permissions");
  const permissions: string[] = rawPermissions ? JSON.parse(rawPermissions) : [];
  if (!permissions.includes("settings.manage")) {
    redirect("/admin/unauthorized");
  }

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year, event_start_date, event_end_date")
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
          <Link href="/admin" aria-label="Back to admin">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Meal Scan Counts</h1>
      </div>
      <div className="p-4 sm:p-6">
        <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
          Adjust the scanned meal counts shown on the Daily Meal Report. The
          system count comes from QR check-ins and can&rsquo;t be edited
          directly; enter an adjustment (positive or negative) to correct the
          reported total. Real check-in records are never changed, and every
          adjustment is logged.
        </p>
        <MealScanCountsClient
          events={(events ?? []).map((e) => ({
            id: e.id,
            name_en: e.name_en,
            year: e.year,
            startDate: e.event_start_date,
            endDate: e.event_end_date,
          }))}
        />
      </div>
    </div>
  );
}
