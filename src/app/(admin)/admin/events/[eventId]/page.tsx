import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventDetailForm } from "./event-detail-form";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("eckcm_events")
    .select("*")
    .eq("id", eventId)
    .single();

  if (!event) {
    notFound();
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Edit Event: {event.name_en}</h1>
      </div>
      <div className="p-6">
        <EventDetailForm event={event} />
      </div>
    </div>
  );
}
