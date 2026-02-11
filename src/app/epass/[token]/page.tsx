import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "crypto";
import { notFound } from "next/navigation";
import { EPassViewer } from "./epass-viewer";

export default async function EPassPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const admin = createAdminClient();

  const { data: epass } = await admin
    .from("ECKCM_epass_tokens")
    .select(
      `
      id,
      token_hash,
      is_active,
      created_at,
      person_id,
      registration_id,
      ECKCM_people!inner(first_name_en, last_name_en, display_name_ko, gender, birth_date),
      ECKCM_registrations!inner(
        confirmation_code,
        event_id,
        ECKCM_events!inner(name_en, name_ko, year, start_date, end_date, venue_name)
      )
    `
    )
    .eq("token_hash", tokenHash)
    .single();

  if (!epass) {
    notFound();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = epass as any;

  return (
    <EPassViewer
      token={token}
      epass={{
        id: data.id,
        isActive: data.is_active,
        createdAt: data.created_at,
        person: {
          firstName: data.ECKCM_people.first_name_en,
          lastName: data.ECKCM_people.last_name_en,
          koreanName: data.ECKCM_people.display_name_ko,
          gender: data.ECKCM_people.gender,
          birthDate: data.ECKCM_people.birth_date,
        },
        registration: {
          confirmationCode: data.ECKCM_registrations.confirmation_code,
          event: {
            nameEn: data.ECKCM_registrations.ECKCM_events.name_en,
            nameKo: data.ECKCM_registrations.ECKCM_events.name_ko,
            year: data.ECKCM_registrations.ECKCM_events.year,
            startDate: data.ECKCM_registrations.ECKCM_events.start_date,
            endDate: data.ECKCM_registrations.ECKCM_events.end_date,
            venue: data.ECKCM_registrations.ECKCM_events.venue_name,
          },
        },
      }}
    />
  );
}
