"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Loader2, Grid3x3 } from "lucide-react";
import {
  PRINT_CSS,
  LanyardSheets,
  useLanyardData,
  BADGES_PER_SHEET,
} from "../lanyard-shared";

/**
 * Test page — auto-loads real participants from the default event and renders
 * ONLY the first sheet (8 badges) for a quick design check with real data.
 */
export default function PrintLanyardTestPage() {
  const { eventId, badges, loading, loaded, loadBadges } = useLanyardData();
  const [showGrid, setShowGrid] = useState(true);

  // Auto-load all printable participants as soon as the default event resolves.
  useEffect(() => {
    if (eventId) loadBadges("ALL");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // One page only.
  const onePage = badges.slice(0, BADGES_PER_SHEET);

  return (
    <div className="lanyard-root flex flex-col">
      <style>{PRINT_CSS}</style>

      <div className="lanyard-no-print flex items-center gap-3 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Lanyard Test</h1>
        <span className="text-xs text-muted-foreground">
          Real participants · default event · 1 page ({onePage.length})
        </span>

        <label className="ml-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(e) => setShowGrid(e.target.checked)}
          />
          <Grid3x3 className="size-3.5" /> Grid lines
        </label>

        {loading && <Loader2 className="size-4 animate-spin" />}
        {onePage.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 size-4" />
            Print (1 page)
          </Button>
        )}

        <a
          href="/admin/print/lanyard"
          className="ml-auto text-xs text-blue-600 underline"
        >
          ← Back to full print page
        </a>
      </div>

      {loaded && badges.length === 0 && (
        <p className="lanyard-no-print p-6 text-sm text-muted-foreground">
          No participants found for the default event.
        </p>
      )}

      <LanyardSheets badges={onePage} showGrid={showGrid} calibrate={false} />
    </div>
  );
}
