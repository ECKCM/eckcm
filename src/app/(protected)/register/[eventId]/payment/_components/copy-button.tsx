"use client";

import { useState } from "react";
import { Copy, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [pulse, setPulse] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      if (copied) {
        setPulse(true);
        setTimeout(() => setPulse(false), 300);
      }
      setCopied(true);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-start gap-1.5 rounded-md border px-2 py-1 text-sm font-mono font-semibold transition-all duration-200 text-left break-all ${
        copied
          ? "bg-green-100 border-green-400 text-green-800"
          : "bg-purple-100 border-purple-300 text-purple-900 hover:bg-purple-200"
      }`}
      style={pulse ? { transform: "scale(1.08)" } : undefined}
    >
      <span className="flex-1 min-w-0">{text}</span>
      {copied ? (
        <ClipboardCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0 mt-0.5 text-purple-600" />
      )}
    </button>
  );
}
