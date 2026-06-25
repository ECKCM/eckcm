"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Printer, QrCode, Grid3x3, RotateCcw } from "lucide-react";
// Reuse the lanyard print template so meal cards print on the SAME Avery 5390
// stock with the SAME calibration tooling (single source for the physical
// sheet/cell geometry + print CSS). Only the per-cell content differs.
import { PRINT_CSS, BADGES_PER_SHEET, chunk } from "../lanyard/lanyard-shared";

interface GeneratedPass {
  id: string;
  token: string;
  tierCode: string | null;
  redeemUrl: string;
}

const TIER_LABEL: Record<string, string> = {
  MEAL_GENERAL: "General",
  MEAL_YOUTH: "Youth",
};

// Inner-cell content styling only — the sheet/cell geometry (3.5" × 2.25",
// 8 per sheet, calibration, grid, print) comes from the shared lanyard CSS.
const QRCARD_CSS = `
.qrcard-inner {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 0.18in;
  padding: 0.12in 0.16in;
  overflow: hidden;
  font-family: ui-sans-serif, system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
}
.qrcard-qr { flex-shrink: 0; background: #fff; display: flex; }
.qrcard-body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  min-width: 0;
}
.qrcard-title { font-weight: 700; font-size: 13px; line-height: 1.1; color: #0f172a; }
.qrcard-sub { font-size: 9.5px; color: #475569; line-height: 1.2; }
.qrcard-badge {
  align-self: flex-start;
  margin-top: 2px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #dc2626;
  color: #fff;
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.qrcard-ref { font-size: 8px; color: #94a3b8; font-family: ui-monospace, monospace; margin-top: 1px; }
.qrcard-cellno {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%;
  color: #94a3b8; font-size: 9pt; font-family: ui-monospace, monospace;
}
`;

const clampQty = (v: string) => {
  const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
  return isFinite(n) ? Math.min(500, Math.max(0, n)) : 0;
};

export default function PrintQRCardsPage() {
  const [general, setGeneral] = useState(0);
  const [youth, setYouth] = useState(0);
  const [label, setLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [passes, setPasses] = useState<GeneratedPass[]>([]);

  // Print calibration — mirrors the lanyard page (persisted per browser/printer,
  // its own storage key so the two pages calibrate independently).
  const [showGrid, setShowGrid] = useState(false);
  const [calibrate, setCalibrate] = useState(false);
  const [scale, setScale] = useState(100); // percent
  const [offsetX, setOffsetX] = useState(0); // mm
  const [offsetY, setOffsetY] = useState(0); // mm

  useEffect(() => {
    try {
      const raw = localStorage.getItem("qrcards-calibration");
      if (raw) {
        const c = JSON.parse(raw);
        if (typeof c.scale === "number") setScale(c.scale);
        if (typeof c.offsetX === "number") setOffsetX(c.offsetX);
        if (typeof c.offsetY === "number") setOffsetY(c.offsetY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "qrcards-calibration",
      JSON.stringify({ scale, offsetX, offsetY })
    );
  }, [scale, offsetX, offsetY]);

  const resetCalibration = () => {
    setScale(100);
    setOffsetX(0);
    setOffsetY(0);
  };

  const totalRequested = general + youth;

  const generate = async () => {
    if (totalRequested < 1) {
      toast.error("Enter at least one pass.");
      return;
    }
    if (totalRequested > 500) {
      toast.error("Up to 500 passes per batch.");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/meal-passes/bulk-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          general,
          youth,
          label: label.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to generate");
        setGenerating(false);
        return;
      }
      setPasses(data.passes);
      toast.success(`Generated ${data.passes.length} single-use meal passes`);
    } catch {
      toast.error("Network error. Please try again.");
    }
    setGenerating(false);
  };

  // Chunk passes into Avery 5390 sheets (8 per sheet). Calibration mode renders
  // a single empty numbered grid instead.
  const realSheets = chunk(passes, BADGES_PER_SHEET);
  const sheets: (GeneratedPass | null)[][] = calibrate
    ? [Array.from({ length: BADGES_PER_SHEET }, () => null)]
    : realSheets;

  const sheetCount = realSheets.length;

  const rootStyle = {
    ["--cal-scale" as string]: String(scale / 100),
    ["--cal-x" as string]: `${offsetX}mm`,
    ["--cal-y" as string]: `${offsetY}mm`,
  } as React.CSSProperties;

  // Only attach the calibration transform when it differs from the default —
  // a transformed sheet zooms and breaks pagination when printing from Safari.
  const isCalibrated = scale !== 100 || offsetX !== 0 || offsetY !== 0;

  return (
    <div
      className={`lanyard-root flex flex-col${isCalibrated ? " lanyard-calibrated" : ""}`}
      style={rootStyle}
    >
      <style>{PRINT_CSS}</style>
      <style>{QRCARD_CSS}</style>

      {/* Controls — hidden when printing */}
      <div className="lanyard-no-print">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <h1 className="text-lg font-semibold">Print Meal QR Cards</h1>
          <span className="text-xs text-muted-foreground">
            Avery 5390 · 8 per sheet · 3.5&quot; × 2.25&quot;
          </span>
        </div>

        <div className="space-y-4 p-6">
          <Card className="mx-auto w-full max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                Disposable Meal Passes
              </CardTitle>
              <CardDescription>
                Generate single-use meal QR codes by tier to hand out at the
                registration desk (e.g. General × 5 + Youth × 5). Every code is
                unique and becomes invalid after one scan at the meal line.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="general">General (11+)</Label>
                  <Input
                    id="general"
                    inputMode="numeric"
                    value={general}
                    onChange={(e) => setGeneral(clampQty(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="youth">Youth (5–10)</Label>
                  <Input
                    id="youth"
                    inputMode="numeric"
                    value={youth}
                    onChange={(e) => setYouth(clampQty(e.target.value))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="label">Label (optional)</Label>
                <Input
                  id="label"
                  placeholder="e.g. Sat dinner — desk"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={200}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Up to 500 passes per batch ({totalRequested} selected). Each is a
                single-use QR tagged with its tier.
              </p>

              <div className="flex gap-2">
                <Button onClick={generate} disabled={generating || totalRequested < 1}>
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>Generate {totalRequested > 0 ? totalRequested : ""} passes</>
                  )}
                </Button>
                {passes.length > 0 && (
                  <Button variant="outline" onClick={() => window.print()}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                  </Button>
                )}
              </div>

              {passes.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {passes.length} passes ready across {sheetCount} sheet
                  {sheetCount !== 1 ? "s" : ""}. Use your browser&apos;s print
                  dialog (Letter, margins: None).
                </p>
              )}
            </CardContent>
          </Card>

          {/* Layout options + calibration — same controls as the lanyard page. */}
          <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
              <Grid3x3 className="size-3.5" /> Grid lines
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={calibrate}
                onChange={(e) => setCalibrate(e.target.checked)}
              />
              Calibration mode (empty grid)
            </label>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Scale</span>
              <input
                type="range"
                min={94}
                max={106}
                step={0.25}
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                className="w-32"
              />
              <span className="w-12 tabular-nums">{scale}%</span>
            </div>
            <NudgeControl label="X" value={offsetX} onChange={setOffsetX} />
            <NudgeControl label="Y" value={offsetY} onChange={setOffsetY} />
            <Button variant="ghost" size="sm" onClick={resetCalibration}>
              <RotateCcw className="mr-1 size-3.5" /> Reset
            </Button>
          </div>

          <p className="mx-auto w-full max-w-2xl text-xs text-muted-foreground">
            Print tip: in the browser dialog set <strong>Scale 100%</strong>,{" "}
            <strong>Margins: None</strong>, turn off headers/footers, and use
            Chrome for best alignment. If a printer drifts, run Calibration mode
            once and nudge Scale/X/Y.
          </p>
        </div>
      </div>

      {/* Print area — Avery 5390 sheets (shared lanyard template). */}
      {(passes.length > 0 || calibrate) && (
        <div className="lanyard-workbench">
          {sheets.map((sheet, si) => (
            <div key={si} className="lanyard-sheet">
              {Array.from({ length: BADGES_PER_SHEET }, (_, ci) => {
                const p = sheet[ci] ?? null;
                return (
                  <div
                    key={ci}
                    className={`lanyard-cell ${showGrid ? "bordered" : ""}`}
                  >
                    {p ? (
                      <div className="qrcard-inner">
                        <div className="qrcard-qr">
                          <QRCodeSVG
                            value={p.redeemUrl}
                            size={124}
                            level="H"
                            fgColor="#000000"
                            bgColor="#ffffff"
                          />
                        </div>
                        <div className="qrcard-body">
                          <div className="qrcard-title">
                            Meal Pass
                            {p.tierCode && TIER_LABEL[p.tierCode]
                              ? ` — ${TIER_LABEL[p.tierCode]}`
                              : ""}
                          </div>
                          <div className="qrcard-sub">
                            Scan at the meal line.
                            <br />
                            식사 줄에서 스캔
                          </div>
                          <span className="qrcard-badge">일회용 · SINGLE-USE</span>
                          <div className="qrcard-ref">{p.token.slice(0, 8)}</div>
                        </div>
                      </div>
                    ) : calibrate ? (
                      <div className="qrcard-cellno">
                        CELL {si * BADGES_PER_SHEET + ci + 1}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Calibration nudge (mm), matches the lanyard page control ───────────── */

function NudgeControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => onChange(Math.round((value - 0.5) * 10) / 10)}
      >
        −
      </Button>
      <span className="w-12 text-center tabular-nums">{value}mm</span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => onChange(Math.round((value + 0.5) * 10) / 10)}
      >
        +
      </Button>
    </div>
  );
}
