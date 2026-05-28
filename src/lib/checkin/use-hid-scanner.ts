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
      // commercial QR scanners as the suffix character.
      if (e.key === "Enter" || e.key === "Tab") {
        if (fastStreamRef.current && bufferRef.current.length >= minLength) {
          e.preventDefault();
          e.stopPropagation();
        }
        flush();
        lastKeyAtRef.current = now;
        return;
      }

      // Printable single-character key.
      if (e.key.length === 1) {
        bufferRef.current += e.key;
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
            // global shortcuts.
            e.preventDefault();
            e.stopPropagation();
            scheduleIdleFlush();
          }
          onBufferRef.current?.(bufferRef.current, fastStreamRef.current);
        }
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
