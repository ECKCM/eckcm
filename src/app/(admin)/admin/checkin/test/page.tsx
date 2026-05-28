import { createClient } from "@/lib/supabase/server";
import { TestCheckinClient } from "./test-client";

interface ParticipantRow {
  person_id: string;
  participant_code: string;
  eckcm_groups: {
    registration_id: string;
    eckcm_registrations: {
      event_id: string;
      confirmation_code: string;
      status: string;
    };
  };
  eckcm_people: {
    first_name_en: string;
    last_name_en: string;
    display_name_ko: string | null;
    gender: string | null;
    birth_date: string | null;
  };
}

export default async function TestCheckinPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year, event_start_date, event_end_date")
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  const defaultEvent = events?.[0];
  let participants: Array<{
    personId: string;
    participantCode: string;
    name: string;
    koreanName: string | null;
    gender: string | null;
    birthDate: string | null;
    confirmationCode: string;
    registrationStatus: string;
  }> = [];

  if (defaultEvent) {
    const { data: rows } = await supabase
      .from("eckcm_group_memberships")
      .select(`
        person_id,
        participant_code,
        eckcm_groups!inner(
          registration_id,
          eckcm_registrations!inner(event_id, confirmation_code, status)
        ),
        eckcm_people!inner(first_name_en, last_name_en, display_name_ko, gender, birth_date)
      `)
      .eq("eckcm_groups.eckcm_registrations.event_id", defaultEvent.id)
      .limit(500);

    participants = ((rows as unknown as ParticipantRow[]) ?? []).map((r) => ({
      personId: r.person_id,
      participantCode: r.participant_code,
      name: `${r.eckcm_people.first_name_en} ${r.eckcm_people.last_name_en}`,
      koreanName: r.eckcm_people.display_name_ko,
      gender: r.eckcm_people.gender,
      birthDate: r.eckcm_people.birth_date,
      confirmationCode: r.eckcm_groups.eckcm_registrations.confirmation_code,
      registrationStatus: r.eckcm_groups.eckcm_registrations.status,
    }));
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Test Check-in (Sandbox)</h1>
      </div>
      <div className="p-6">
        <TestCheckinClient
          events={(events ?? []).map((e) => ({
            id: e.id,
            name_en: e.name_en,
            year: e.year,
          }))}
          initialEventId={defaultEvent?.id ?? ""}
          initialParticipants={participants}
        />
      </div>
    </div>
  );
}
