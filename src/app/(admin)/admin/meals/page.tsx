import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function MealsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: selections } = await supabase
    .from("eckcm_registration_selections")
    .select("id, fee_category_id, quantity")
    .like("fee_category_id", "%MEAL%");

  const totalMealSelections = selections?.length ?? 0;

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Meals</h1>
      </header>
      <div className="p-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Meal Selections</CardDescription>
              <CardTitle className="text-3xl">{totalMealSelections}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Across all registrations
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Meal Planning Dashboard</CardTitle>
              <CardDescription>
                View meal counts by date and type (Breakfast, Lunch, Dinner) to help
                with catering preparation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Detailed meal planning dashboard with per-date breakdowns
                  and dietary requirements will be available here.
                  Meal selection data is currently managed through the registration flow
                  and pricing service.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
