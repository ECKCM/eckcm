import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const supabase = await createClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  if (!currentUser) redirect("/login");

  const { data: userProfile } = await supabase
    .from("eckcm_users")
    .select(`
      id, auth_user_id, role,
      eckcm_people!inner(
        first_name_en, last_name_en, display_name_ko,
        email, phone, gender, birth_year
      )
    `)
    .eq("id", userId)
    .single();

  if (!userProfile) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = userProfile as any;
  const person = profile.eckcm_people;

  const { data: staffAssignments } = await supabase
    .from("eckcm_staff_assignments")
    .select("id, role, event_id, eckcm_events!inner(name_en, year)")
    .eq("user_id", userId);

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">User Detail</h1>
      </header>
      <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              {person.first_name_en} {person.last_name_en}
              {person.display_name_ko && (
                <span className="text-muted-foreground">
                  ({person.display_name_ko})
                </span>
              )}
              <Badge>{profile.role}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Email</span>
                <p>{person.email || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Phone</span>
                <p>{person.phone || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Gender</span>
                <p>{person.gender || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Birth Year</span>
                <p>{person.birth_year || "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Staff Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            {(staffAssignments ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff assignments.</p>
            ) : (
              <div className="space-y-2">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(staffAssignments ?? []).map((sa: any) => (
                  <div key={sa.id} className="flex items-center justify-between rounded border p-3">
                    <span className="text-sm">
                      {sa.eckcm_events?.name_en} ({sa.eckcm_events?.year})
                    </span>
                    <Badge variant="outline">{sa.role}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
