"use client";

import { useEffect, useRef } from "react";

interface UseHidScannerOptions {
  /**
   * Maximum delay (ms) between keystrokes for them to be considered part of
   * the same scan. USB QR scanners usually emit at 5–80ms; humans typing fast
   * are still ~80–120ms apart. 100ms is a safe default.
   */
  maxInterKeyMs?: number;
  /**
   * If the scanner doesn't send a terminator (Enter / Tab), flush the buffer
   * after this idle gap. Helps with cheaper scanners that send no terminator.
   */
  idleFlushMs?: number;
  /** Minimum buffer length to treat as a valid scan. */
  minLength?: number;
  /** Maximum buffer length — prevents runaway capture. */
  maxLength?: number;
  /** Disable the listener (e.g. while a modal owns the keyboard). */
  enabled?: boolean;
  /** Called with the captured value when a fast burst + terminator/idle is detected. */
  onScan: (value: string) => void;
  /**
   * Optional debug callback fired on every accumulated buffer state. Helpful
   * for the "is my scanner working?" diagnostic UI.
   */
  onBuffer?: (buffer: string, fastStream: boolean) => void;
}

const FORM_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isFormElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (FORM_TAGS.has(target.tagName)) return true;
  return target.isContentEditable;
}

// Punctuation that can appear in a participant code QR (".") or in legacy
// e-pass URL tokens ("/", "-", "_", ":"). The pair is [no-shift, shift].
const SHIFTED_PUNCT: Record<string, [string, string]> = {
  Period: [".", ">"],
  Slash: ["/", "?"],
  Minus: ["-", "_"],
  Equal: ["=", "+"],
  Semicolon: [";", ":"],
  Quote: ["'", '"'],
  BracketLeft: ["[", "{"],
  BracketRight: ["]", "}"],
  Backslash: ["\\", "|"],
  Comma: [",", "<"],
  Backquote: ["`", "~"],
};

/**
 * Translate a physical key (KeyboardEvent.code) into the character it would
 * normally produce on a US-QWERTY layout, honoring shift. We use this — not
 * `e.key` — whenever an IME is active (Korean / Japanese / Chinese), because
 * an IME rewrites `e.key` into composing jamo / kana (e.g. "ㅁ" instead of
 * "a"). `e.code` stays "KeyA" regardless of IME state, so a fast HID-scanner
 * burst still parses through "한국어" input mode.
 *
 * Returns null for any key we don't care about (modifiers, F-keys, etc.).
 */
function codeToChar(code: string, shift: boolean): string | null {
  if (/^Key[A-Z]$/.test(code)) {
    const upper = code.slice(3);
    return shift ? upper : upper.toLowerCase();
  }
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
  if (code === "NumpadDecimal") return ".";
  if (code === "NumpadDivide") return "/";
  if (code === "NumpadSubtract") return "-";
  if (code === "Space") return " ";
  const punct = SHIFTED_PUNCT[code];
  if (punct) return shift ? punct[1] : punct[0];
  return null;
}

const TERMINATOR_CODES = new Set(["Enter", "NumpadEnter", "Tab"]);
// Printable single-byte ASCII (space ‥ tilde). Anything else from `e.key`
// (Hangul jamo, "Process", multi-codepoint emoji, etc.) we treat as IME
// noise and fall back to the physical-key map.
const ASCII_PRINTABLE_RE = /^[\x20-\x7E]$/;

/**
 * Listen for HID-style keyboard input from a USB / Bluetooth QR scanner.
 *
 * Detection strategy:
 *   1. Track time between keydowns. A "fast burst" is 2+ keys arriving within
 *      `maxInterKeyMs` of each other.
 *   2. Letters/digits/symbols accumulate into the buffer; Enter / Tab flushes it.
 *   3. If no terminator arrives but the burst stays idle for `idleFlushMs`,
 *      flush anyway (some scanners omit the terminator).
 *   4. Once a fast burst starts, subsequent keys are preventDefault'd so they
 *      don't leak into focused buttons / body. Form inputs are skipped
 *      entirely so an operator can still type into a search box, etc.
 */
export function useHidScanner({
  maxInterKeyMs = 100,
  idleFlushMs = 80,
  minLength = 4,
  maxLength = 80,
  enabled = true,
  onScan,
  onBuffer,
}: UseHidScannerOptions) {
  const bufferRef = useRef<string>("");
  const lastKeyAtRef = useRef<number>(0);
  const fastStreamRef = useRef<boolean>(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep callbacks stable without re-binding the listener.
  const onScanRef = useRef(onScan);
  const onBufferRef = useRef(onBuffer);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);
  useEffect(() => {
    onBufferRef.current = onBuffer;
  }, [onBuffer]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const flush = () => {
      const captured = bufferRef.current;
      const wasFast = fastStreamRef.current;
      bufferRef.current = "";
      fastStreamRef.current = false;
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      onBufferRef.current?.("", false);
      if (wasFast && captured.length >= minLength) {
        onScanRef.current(captured);
      }
    };

    const scheduleIdleFlush = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(flush, idleFlushMs);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // If the operator is typing into an input, let the input handle it —
      // do not double-process via the scanner pipeline.
      if (isFormElement(e.target)) return;

      const now = performance.now();
      const dt = now - lastKeyAtRef.current;

      // Slow gap → reset; this keystroke starts a new potential scan.
      if (dt > maxInterKeyMs) {
        bufferRef.current = "";
        fastStreamRef.current = false;
      }

      // Terminators: Enter (CR) or Tab — both are commonly configured on
      // commercial QR scanners as the suffix character. Match against
      // `e.code` so a Korean / Japanese IME (which can rewrite `e.key` to
      // "Process") still flushes correctly.
      if (TERMINATOR_CODES.has(e.code) || e.key === "Enter" || e.key === "Tab") {
        if (fastStreamRef.current && bufferRef.current.length >= minLength) {
          e.preventDefault();
          e.stopPropagation();
        }
        flush();
        lastKeyAtRef.current = now;
        return;
      }

      // Resolve the character. Prefer plain printable ASCII from `e.key`
      // (covers every non-IME case incl. exotic layouts). When the IME is
      // active, `e.key` becomes Hangul jamo or "Process" — fall back to the
      // physical-key map driven by `e.code`, which the IME doesn't touch.
      // This is what makes hardware scans parse correctly while the OS input
      // language is Korean ("한국어"), which was previously a silent reject.
      const fromKey =
        e.key.length === 1 && ASCII_PRINTABLE_RE.test(e.key) ? e.key : null;
      const fromCode = fromKey === null ? codeToChar(e.code, e.shiftKey) : null;
      const ch = fromKey ?? fromCode;
      if (!ch) return;

      bufferRef.current += ch;
      if (bufferRef.current.length > maxLength) {
        // Likely garbage — reset.
        bufferRef.current = "";
        fastStreamRef.current = false;
        onBufferRef.current?.("", false);
      } else {
        if (dt <= maxInterKeyMs && bufferRef.current.length >= 2) {
          fastStreamRef.current = true;
        }
        if (fastStreamRef.current) {
          // Once we're confident this is a scanner burst, consume the
          // keystrokes so they don't dirty focused buttons or trigger
          // global shortcuts. Also blocks the IME from receiving them as
          // composition input, which is what was eating Hangul-mode scans.
          e.preventDefault();
          e.stopPropagation();
          scheduleIdleFlush();
        }
        onBufferRef.current?.(bufferRef.current, fastStreamRef.current);
      }

      lastKeyAtRef.current = now;
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [enabled, maxInterKeyMs, idleFlushMs, minLength, maxLength]);
}
