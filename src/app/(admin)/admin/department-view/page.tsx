import { headers } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";

export default async function DepartmentViewPage() {
  const supabase = await createClient();

  const headersList = await headers();
  const rawPermissions = headersList.get("x-user-permissions");
  const rawDeptIds = headersList.get("x-user-department-ids");

  const permissions: string[] = rawPermissions ? JSON.parse(rawPermissions) : [];
  const scopedDeptIds: string[] = rawDeptIds ? JSON.parse(rawDeptIds) : [];

  const hasFullAccess = permissions.includes("participant.read");

  let deptQuery = supabase
    .from("eckcm_departments")
    .select("id, short_code, name_en, name_ko, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order");

  if (!hasFullAccess) {
    if (scopedDeptIds.length === 0) {
      deptQuery = deptQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      deptQuery = deptQuery.in("id", scopedDeptIds);
    }
  }

  const { data: departments } = await deptQuery;

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Department View</h1>
      </header>

      <div className="p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          {hasFullAccess
            ? "Browse all departments. Click a department to see its participants."
            : "Departments you can manage. Click to view participants."}
        </p>

        {(departments ?? []).length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No departments available.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(departments ?? []).map((dept) => (
              <Link key={dept.id} href={`/admin/department-view/${dept.id}`}>
                <Card className="cursor-pointer transition hover:border-primary hover:shadow-md">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="size-5 text-muted-foreground" />
                      <CardTitle className="text-base">{dept.name_en}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {dept.name_ko}
                    </p>
                    <p className="text-xs font-mono text-muted-foreground mt-1">
                      {dept.short_code}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
