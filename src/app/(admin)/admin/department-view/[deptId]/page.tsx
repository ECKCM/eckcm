import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { DepartmentParticipantsTable } from "@/components/admin/department-view/participants-table";

export default async function DepartmentParticipantsPage({
  params,
}: {
  params: Promise<{ deptId: string }>;
}) {
  const { deptId } = await params;
  const supabase = await createClient();

  const headersList = await headers();
  const rawPermissions = headersList.get("x-user-permissions");
  const rawDeptIds = headersList.get("x-user-department-ids");

  const permissions: string[] = rawPermissions ? JSON.parse(rawPermissions) : [];
  const scopedDeptIds: string[] = rawDeptIds ? JSON.parse(rawDeptIds) : [];

  const hasFullAccess = permissions.includes("participant.read");

  if (!hasFullAccess && !scopedDeptIds.includes(deptId)) {
    redirect("/admin/unauthorized");
  }

  const { data: dept } = await supabase
    .from("eckcm_departments")
    .select("id, short_code, name_en, name_ko, is_active")
    .eq("id", deptId)
    .maybeSingle();

  if (!dept) notFound();

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year")
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link href="/admin/department-view">
            <ArrowLeft className="size-4" />
            Departments
          </Link>
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">
          {dept.name_en}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {dept.name_ko}
          </span>
        </h1>
      </header>
      <div className="p-6">
        <DepartmentParticipantsTable
          departmentId={dept.id}
          departmentName={dept.name_en}
          events={events ?? []}
        />
      </div>
    </div>
  );
}
