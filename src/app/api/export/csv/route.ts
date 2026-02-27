import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminCheck = await requireAdmin();
  if (!adminCheck) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { type, eventId } = await request.json();
  const admin = createAdminClient();

  if (type === "registrations") {
    const { data: registrations } = await admin
      .from("eckcm_registrations")
      .select(
        "id, confirmation_code, status, total_amount_cents, start_date, end_date, created_at"
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    const rows = registrations ?? [];
    const headers = [
      "Confirmation Code",
      "Status",
      "Total Amount",
      "Start Date",
      "End Date",
      "Created At",
    ];
    const csvRows = [
      headers.join(","),
      ...rows.map((r) =>
        [
          r.confirmation_code,
          r.status,
          (r.total_amount_cents / 100).toFixed(2),
          r.start_date,
          r.end_date,
          r.created_at,
        ].join(",")
      ),
    ];
    const csv = csvRows.join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="registrations-${eventId}.csv"`,
      },
    });
  }

  if (type === "participants") {
    const { data: participants } = await admin
      .from("eckcm_people")
      .select(
        "id, first_name_en, last_name_en, display_name_ko, email, phone, gender, birth_year"
      )
      .order("last_name_en");

    const rows = participants ?? [];
    const headers = [
      "First Name",
      "Last Name",
      "Korean Name",
      "Email",
      "Phone",
      "Gender",
      "Birth Year",
    ];
    const csvRows = [
      headers.join(","),
      ...rows.map((p) =>
        [
          `"${p.first_name_en}"`,
          `"${p.last_name_en}"`,
          `"${p.display_name_ko || ""}"`,
          p.email || "",
          p.phone || "",
          p.gender || "",
          p.birth_year || "",
        ].join(",")
      ),
    ];
    const csv = csvRows.join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="participants.csv"`,
      },
    });
  }

  return NextResponse.json({ error: "Invalid export type" }, { status: 400 });
}
