import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ScanLine, UtensilsCrossed, Hotel, ExternalLink, Activity, ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveUpjToken } from "@/lib/services/upj-lodging";
import { deriveLiveToken } from "@/lib/services/checkin-live";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = {
  title: "UPJ Staff Dashboard",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// Defense in depth: middleware is the primary gate, but a stale or missing
// middleware rule should never expose this page to a non-UPJ user.
const ALLOWED_ROLES = new Set([
  "UPJ_STAFF",
  "SUPER_ADMIN",
  "EVENT_ADMIN",
]);

export default async function UpjStaffDashboardPage() {
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

  const hasAccess = roleNames.some((name) => ALLOWED_ROLES.has(name));
  if (!hasAccess) {
    // Logged-in user without UPJ_STAFF — bounce to the regular dashboard
    // so they don't get stuck on an empty page.
    redirect("/dashboard");
  }

  // Derive the public UPJ lodging capability URL from the same secret the
  // admin "copy link" tool uses, so secret rotation flows through here too.
  const admin = createAdminClient();
  const { data: appConfig } = await admin
    .from("eckcm_app_config")
    .select("epass_hmac_secret")
    .eq("id", 1)
    .single();
  const secret = (appConfig as { epass_hmac_secret?: string | null } | null)
    ?.epass_hmac_secret;
  const upjToken = deriveUpjToken(secret);
  const upjLodgingHref = upjToken ? `/upj-lodging/${upjToken}` : null;
  const liveToken = deriveLiveToken(secret);
  const liveCountsHref = liveToken ? `/live/${liveToken}` : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-8 sm:py-12">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">UPJ Staff Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {user.email}
          </p>
        </div>
        <SignOutButton />
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DashboardCard
          href="/admin/checkin/kiosk"
          icon={UtensilsCrossed}
          title="Meal Kiosk"
          description="Full-screen scanning for meal entry."
        />
        <DashboardCard
          href="/admin/checkin/scan-sessions"
          icon={ScanLine}
          title="Scan Sessions"
          description="Review and manage check-in sessions."
        />
        <DashboardCard
          href="/upj-staff/daily-meal-report"
          icon={ClipboardList}
          title="Daily Meal Report"
          description="Served meals by age tier for any day. Export CSV or print."
        />
        <DashboardCard
          href="/upj-staff/full-meal-report"
          icon={ClipboardList}
          title="Full Meal Report"
          description="Every day of the event by meal and age tier, with totals."
        />
        {liveCountsHref && (
          <DashboardCard
            href={liveCountsHref}
            icon={Activity}
            title="Live Counts (Public)"
            description="Real-time counts for active scans — shareable, no login."
            external
          />
        )}
        {upjLodgingHref ? (
          <DashboardCard
            href={upjLodgingHref}
            icon={Hotel}
            title="UPJ Lodging Table"
            description="Live room assignments by building and floor."
            external
          />
        ) : (
          <Card className="opacity-60">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Hotel className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">UPJ Lodging Table</CardTitle>
              </div>
              <CardDescription>
                Not available — UPJ lodging secret is not configured.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}

function DashboardCard({
  href,
  icon: Icon,
  title,
  description,
  external,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
  external?: boolean;
}) {
  const linkProps = external
    ? { target: "_blank" as const, rel: "noopener noreferrer" }
    : {};
  return (
    <Link href={href} {...linkProps} className="group">
      <Card className="h-full transition-shadow hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{title}</CardTitle>
            {external && (
              <ExternalLink className="ml-auto h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-primary group-hover:underline">
          Open →
        </CardContent>
      </Card>
    </Link>
  );
}
