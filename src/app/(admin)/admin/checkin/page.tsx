import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ScanLine,
  LogOut,
  UtensilsCrossed,
  Presentation,
  Monitor,
  BarChart3,
  Beaker,
  History,
  ArrowLeft,
} from "lucide-react";

const modeCards = [
  {
    href: "/admin/checkin/main",
    icon: ScanLine,
    title: "Check-in",
    description: "Mobile-operated arrival check-in",
  },
  {
    href: "/admin/checkin/checkout",
    icon: LogOut,
    title: "Check-out",
    description: "Mobile-operated departure scanning",
  },
  {
    href: "/admin/checkin/meal",
    icon: UtensilsCrossed,
    title: "Meal Check-in",
    description: "Mobile scanner for breakfast / lunch / dinner",
  },
  {
    href: "/admin/checkin/kiosk",
    icon: Monitor,
    title: "Meal Check-in (Kiosk)",
    description: "Fullscreen kiosk for self-service meals",
  },
  {
    href: "/admin/checkin/session",
    icon: Presentation,
    title: "Session Check-in",
    description: "Track attendance for individual sessions",
  },
  {
    href: "/admin/checkin/stats",
    icon: BarChart3,
    title: "Statistics",
    description: "Real-time arrival, meal, and session counts",
  },
  {
    href: "/admin/checkin/scan-sessions",
    icon: History,
    title: "Scan Sessions",
    description: "Past and active sessions with their check-ins",
  },
  {
    href: "/admin/checkin/test",
    icon: Beaker,
    title: "Test / Sandbox",
    description: "Rehearse scanning without writing real check-ins",
  },
];

export default function CheckinHubPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
          <Link href="/admin" aria-label="Back to admin">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Check-in</h1>
      </div>
      <div className="p-6">
        <p className="text-sm text-muted-foreground mb-4">
          Pick a check-in surface to open its scanner.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {modeCards.map((card) => (
            <Link key={card.href} href={card.href}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-2 pt-4 px-4">
                  <card.icon className="h-6 w-6 text-muted-foreground mb-1" />
                  <CardTitle className="text-base">{card.title}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <CardDescription>{card.description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
