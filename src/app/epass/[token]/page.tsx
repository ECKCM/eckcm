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
    .from("eckcm_epass_tokens")
    .select(
      `
      id,
      token_hash,
      is_active,
      created_at,
      person_id,
      registration_id,
      eckcm_people!inner(first_name_en, last_name_en, display_name_ko, gender, birth_date),
      eckcm_registrations!inner(
        confirmation_code,
        event_id,
        eckcm_events!inner(name_en, name_ko, year, event_start_date, event_end_date, location)
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
          firstName: data.eckcm_people.first_name_en,
          lastName: data.eckcm_people.last_name_en,
          koreanName: data.eckcm_people.display_name_ko,
          gender: data.eckcm_people.gender,
          birthDate: data.eckcm_people.birth_date,
        },
        registration: {
          confirmationCode: data.eckcm_registrations.confirmation_code,
          event: {
            nameEn: data.eckcm_registrations.eckcm_events.name_en,
            nameKo: data.eckcm_registrations.eckcm_events.name_ko,
            year: data.eckcm_registrations.eckcm_events.year,
            startDate: data.eckcm_registrations.eckcm_events.event_start_date,
            endDate: data.eckcm_registrations.eckcm_events.event_end_date,
            venue: data.eckcm_registrations.eckcm_events.location,
          },
        },
      }}
    />
  );
}
