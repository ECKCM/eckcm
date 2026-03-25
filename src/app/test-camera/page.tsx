"use client";

import { useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { CameraErrorFallback } from "@/components/checkin/camera-error-fallback";
import { useCameraPermission } from "@/lib/checkin/use-camera-permission";

export default function TestCameraPage() {
  const [scanning, setScanning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const camera = useCameraPermission();

  function addLog(msg: string) {
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  }

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: "0 auto", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 16 }}>
        Camera Permission Test
      </h1>

      <p style={{ marginBottom: 12, fontSize: 14, color: "#666" }}>
        Camera status: <strong>{camera.status}</strong>
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {camera.status === "granted" && !scanning && (
          <button
            onClick={() => {
              addLog("Starting scanner...");
              setScanning(true);
            }}
            style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ccc", cursor: "pointer", background: "#0070f3", color: "white" }}
          >
            Start Scanner
          </button>
        )}
        {scanning && (
          <button
            onClick={() => {
              setScanning(false);
              addLog("Scanner stopped");
            }}
            style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ccc", cursor: "pointer" }}
          >
            Stop Scanner
          </button>
        )}
      </div>

      <div
        style={{
          width: "100%",
          aspectRatio: "1",
          maxWidth: 400,
          border: "2px solid #ddd",
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f5f5",
        }}
      >
        {camera.status !== "granted" ? (
          <CameraErrorFallback
            status={camera.status}
            onAllow={() => {
              addLog("Allow clicked — Scanner will mount and request camera");
              camera.allow();
              setScanning(true);
            }}
          />
        ) : scanning ? (
          <Scanner
            constraints={{ facingMode: { ideal: "environment" } }}
            onScan={(codes) => {
              addLog(`Scanned: ${codes.map((c) => c.rawValue).join(", ")}`);
            }}
            onError={(error) => {
              const msg = error instanceof Error ? error.message : String(error);
              addLog(`Scanner onError: ${msg}`);
              setScanning(false);
              camera.deny();
            }}
            allowMultiple={false}
            scanDelay={500}
            components={{ finder: true }}
            styles={{
              container: { width: "100%", height: "100%" },
              video: { objectFit: "cover" as const },
            }}
          />
        ) : (
          <p style={{ color: "#888" }}>Camera ready. Click &quot;Start Scanner&quot; above.</p>
        )}
      </div>

      <div>
        <h2 style={{ fontSize: 14, fontWeight: "bold", marginBottom: 8 }}>Log</h2>
        <div
          style={{
            background: "#1a1a1a",
            color: "#0f0",
            padding: 12,
            borderRadius: 8,
            fontSize: 12,
            fontFamily: "monospace",
            maxHeight: 300,
            overflow: "auto",
          }}
        >
          {log.length === 0 ? (
            <p style={{ color: "#666" }}>No logs yet</p>
          ) : (
            log.map((entry, i) => (
              <div key={i}>{entry}</div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
