export type FeedbackTone = "success" | "warn" | "error";

const FREQ_BY_TONE: Record<FeedbackTone, number> = {
  success: 800,
  warn: 500,
  error: 300,
};

const VIBRATE_BY_TONE: Record<FeedbackTone, number | number[]> = {
  success: 100,
  warn: [80, 60, 80],
  error: [100, 50, 100, 50, 100],
};

export function playBeep(tone: FeedbackTone = "success"): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = FREQ_BY_TONE[tone];
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + (tone === "success" ? 0.15 : 0.3));
  } catch {
    // Audio not available (no user gesture yet, browser blocked, etc.)
  }
}

export function vibrate(tone: FeedbackTone = "success"): void {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(VIBRATE_BY_TONE[tone]);
    }
  } catch {
    // Vibration not available
  }
}

export function feedback(tone: FeedbackTone): void {
  playBeep(tone);
  vibrate(tone);
}
