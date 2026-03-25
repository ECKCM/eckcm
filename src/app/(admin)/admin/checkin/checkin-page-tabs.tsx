"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckinScanner } from "./checkin-scanner";
import { CheckinStats } from "./checkin-stats";
import {
  ScanLine,
  BarChart3,
  LogOut,
  UtensilsCrossed,
  Presentation,
  Monitor,
  Smartphone,
} from "lucide-react";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
}

const modeCards = [
  {
    href: "/admin/checkin/meal",
    icon: UtensilsCrossed,
    title: "Meal Check-in",
    description: "Scan QR for breakfast, lunch, dinner",
  },
  {
    href: "/admin/checkin/checkout",
    icon: LogOut,
    title: "Check-out",
    description: "Scan QR to record departures",
  },
  {
    href: "/admin/checkin/session",
    icon: Presentation,
    title: "Session Check-in",
    description: "Track attendance for sessions",
  },
  {
    href: "/admin/checkin/self",
    icon: Smartphone,
    title: "Self Check-in",
    description: "Mobile self-service scanning",
  },
  {
    href: "/admin/checkin/kiosk",
    icon: Monitor,
    title: "Kiosk Mode",
    description: "Fullscreen scanner for kiosk devices",
  },
];

export function CheckinPageTabs({ events }: { events: EventOption[] }) {
  return (
    <div className="space-y-6">
      {/* Quick Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {modeCards.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2 pt-4 px-4">
                <card.icon className="h-5 w-5 text-muted-foreground mb-1" />
                <CardTitle className="text-sm">{card.title}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <CardDescription className="text-xs">
                  {card.description}
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Scanner + Stats Tabs */}
      <Tabs defaultValue="scanner">
        <TabsList>
          <TabsTrigger value="scanner" className="gap-1.5">
            <ScanLine className="h-4 w-4" />
            Main Check-in
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Statistics
          </TabsTrigger>
        </TabsList>
        <TabsContent value="scanner" className="mt-4">
          <CheckinScanner events={events} />
        </TabsContent>
        <TabsContent value="stats" className="mt-4">
          <CheckinStats events={events} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
