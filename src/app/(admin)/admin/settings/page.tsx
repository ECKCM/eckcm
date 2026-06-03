import Link from "next/link";
import {
  Layers,
  DollarSign,
  ShieldCheck,
  Building2,
  Church,
  Scale,
  CreditCard,
  BedDouble,
  Presentation,
  Plane,
  Settings2,
  Tag,
} from "lucide-react";

const settingsCards = [
  { href: "/admin/settings/groups", label: "Registration Groups", icon: Layers, description: "Manage registration groups and access codes" },
  { href: "/admin/settings/fees", label: "Fee Categories", icon: DollarSign, description: "Configure pricing tiers and fee structures" },
  { href: "/admin/settings/roles", label: "Roles", icon: ShieldCheck, description: "Manage staff roles and permissions" },
  { href: "/admin/settings/departments", label: "Departments", icon: Building2, description: "Organize departments within the event" },
  { href: "/admin/settings/churches", label: "Churches", icon: Church, description: "Manage church directory for registrations" },
  { href: "/admin/settings/participant-titles", label: "Participant Titles", icon: Tag, description: "Create titles (Speaker, Staff, VIP…) to assign to participants" },
  { href: "/admin/settings/legal", label: "Legal Pages", icon: Scale, description: "Edit terms of service and privacy policy" },
  { href: "/admin/settings/stripe", label: "Stripe", icon: CreditCard, description: "Configure Stripe payment integration" },
  { href: "/admin/settings/lodging", label: "Lodging", icon: BedDouble, description: "Manage buildings, floors, and rooms" },
  { href: "/admin/settings/sessions", label: "Sessions", icon: Presentation, description: "Create and manage event sessions" },
  { href: "/admin/settings/airport-rides", label: "Airport Rides", icon: Plane, description: "Configure airport pickup schedules" },
  { href: "/admin/settings/configuration", label: "Configuration", icon: Settings2, description: "Global application settings" },
];

export default function SettingsOverviewPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {settingsCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="flex items-start gap-4 rounded-lg border p-4 transition-all hover:bg-muted/50 active:bg-muted active:scale-[0.98]"
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
