"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckinScanner } from "./checkin-scanner";
import { CheckinStats } from "./checkin-stats";
import { ScanLine, BarChart3 } from "lucide-react";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
}

export function CheckinPageTabs({ events }: { events: EventOption[] }) {
  return (
    <Tabs defaultValue="scanner">
      <TabsList>
        <TabsTrigger value="scanner" className="gap-1.5">
          <ScanLine className="h-4 w-4" />
          Scanner
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
  );
}
