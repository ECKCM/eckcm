import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { BedDouble, Clock, CheckCircle, Building2 } from "lucide-react";

const lodgingCards = [
  {
    href: "/admin/lodging/buildings",
    label: "Buildings & Rooms",
    icon: Building2,
    description: "View and manage building layouts, floors, and room inventory",
  },
  {
    href: "/admin/lodging/pending",
    label: "Pending Assignments",
    icon: Clock,
    description: "Room groups awaiting room assignment",
  },
  {
    href: "/admin/lodging/assigned",
    label: "Assigned Rooms",
    icon: CheckCircle,
    description: "View current room assignments by building and floor",
  },
  {
    href: "/admin/settings/lodging",
    label: "Lodging Settings",
    icon: BedDouble,
    description: "Configure buildings, floors, and rooms",
  },
];

export default function LodgingOverviewPage() {
  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Lodging</h1>
      </header>
      <div className="p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {lodgingCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <card.icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium">{card.label}</p>
                <p className="text-sm text-muted-foreground">{card.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
