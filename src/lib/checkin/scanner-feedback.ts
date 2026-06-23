export type FeedbackTone = "success" | "warn" | "error" | "duplicate";

const VIBRATE_BY_TONE: Record<FeedbackTone, number | number[]> = {
  success: 120,
  warn: [80, 60, 80],
  error: [120, 60, 120, 60, 120],
  // Long-short-long so the duplicate is felt as distinct from a clean scan.
  duplicate: [220, 90, 90, 90, 220],
};

// One shared AudioContext for the whole surface. Creating a fresh context per
// scan leaks them — after a few dozen scans the browser caps out and audio
// goes silent mid-meal. Reusing one (and resuming it when suspended) keeps
// every beep loud for the entire session.
let sharedCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    if (typeof window === "undefined") return null;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    if (!sharedCtx) sharedCtx = new Ctor();
    if (sharedCtx.state === "suspended") sharedCtx.resume().catch(() => {});
    return sharedCtx;
  } catch {
    return null;
  }
}

interface Note {
  freq: number;
  start: number; // seconds from now
  dur: number; // seconds
  type?: OscillatorType;
  gain?: number; // 0..1 relative to master
}

// Master amplitude. 1.0 is digital full-scale; a square/sawtooth at this level
// is deliberately loud and a touch overdriven so it cuts through a noisy
// dining hall. The OS / device volume is the real ceiling.
const MASTER = 1.0;

function playNotes(notes: Note[]): void {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = n.type ?? "square";
    osc.frequency.value = n.freq;
    osc.connect(g);
    g.connect(ctx.destination);
    const peak = Math.max(0.0001, (n.gain ?? 1) * MASTER);
    const t0 = now + n.start;
    const t1 = t0 + n.dur;
    // Quick attack, exponential release — punchy and clear.
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    g.gain.setValueAtTime(peak, t1 - 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }
}

export function playBeep(tone: FeedbackTone = "success"): void {
  switch (tone) {
    case "success":
      // Loud bright ascending two-note chime — unmistakable "go".
      playNotes([
        { freq: 988, start: 0, dur: 0.13, type: "square" },
        { freq: 1480, start: 0.11, dur: 0.2, type: "square" },
      ]);
      break;
    case "duplicate":
      // Deliberately NOT a chime: a low, double "uh-uh" buzzer that can never
      // be mistaken for the green success tone. This is the "already served"
      // signal the meal desk listens for.
      playNotes([
        { freq: 360, start: 0, dur: 0.16, type: "sawtooth" },
        { freq: 360, start: 0.22, dur: 0.16, type: "sawtooth" },
        { freq: 260, start: 0.44, dur: 0.26, type: "sawtooth" },
      ]);
      break;
    case "warn":
      playNotes([{ freq: 520, start: 0, dur: 0.28, type: "triangle" }]);
      break;
    case "error":
      // Harsh descending buzz.
      playNotes([
        { freq: 300, start: 0, dur: 0.18, type: "sawtooth" },
        { freq: 180, start: 0.18, dur: 0.32, type: "sawtooth" },
      ]);
      break;
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

// Preferred clear female English voices, best-first. The OS default is often a
// robotic low-quality voice ("목소리가 이상해"), so we hunt for a known good
// female voice before falling back. Names vary by platform: Samantha/Ava
// (macOS/iOS), "Google US English" (Chrome, female), Zira (Windows), etc.
const FEMALE_VOICE_HINTS = [
  "google us english",
  "samantha",
  "ava",
  "allison",
  "susan",
  "victoria",
  "karen",
  "moira",
  "tessa",
  "fiona",
  "serena",
  "zira",
  "female",
];

let cachedVoice: SpeechSynthesisVoice | null | undefined = undefined;

function pickFemaleVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null; // not loaded yet
  const en = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const pool = en.length ? en : voices;
  for (const hint of FEMALE_VOICE_HINTS) {
    const m = pool.find((v) => v.name.toLowerCase().includes(hint));
    if (m) return m;
  }
  return pool[0] ?? voices[0] ?? null;
}

// Voices load asynchronously in most browsers — resolve eagerly and refresh
// when the list arrives so the very first spoken cue already uses the good voice.
if (typeof window !== "undefined" && window.speechSynthesis) {
  cachedVoice = pickFemaleVoice();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = pickFemaleVoice();
  };
}

let speechPrimed = false;

/**
 * Unlock audio + speech from inside a user gesture. iOS Safari blocks both the
 * AudioContext and speechSynthesis until they're first triggered by a real tap;
 * a sound fired later by a scan (not a tap) is silently dropped. Call this from
 * the Start / Resume buttons so every later beep AND the spoken "Re-entry" cue
 * actually play on iPad.
 */
export function primeAudio(): void {
  // Create + resume the shared AudioContext under the gesture.
  try {
    getCtx();
  } catch {
    /* ignore */
  }
  // Unlock speech with one silent utterance inside the gesture.
  try {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth || speechPrimed) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    synth.speak(u);
    speechPrimed = true;
  } catch {
    /* ignore */
  }
}

/**
 * Speak a short phrase via the browser's built-in speech synthesis. Used for
 * the duplicate ("Re-entry") cue. Uses a clear female voice at full volume.
 *
 * iOS Safari quirks handled here: speech must have been unlocked from a gesture
 * (see primeAudio), `cancel()` is only issued when something is actually
 * speaking (a bare cancel can wedge speech on iOS), and we nudge `resume()`
 * because iOS sometimes leaves the queue paused right after `speak()`.
 */
export function speak(text: string): void {
  try {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    // Only clear a backlog if one exists — an unconditional cancel() can stop
    // speech from ever starting again on iOS.
    if (synth.speaking || synth.pending) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = cachedVoice ?? pickFemaleVoice();
    if (voice) {
      cachedVoice = voice;
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = "en-US";
    }
    u.volume = 1; // full scale; device volume is the real ceiling
    u.rate = 1;
    u.pitch = 1.05;
    if (synth.paused) synth.resume();
    synth.speak(u);
    // iOS sometimes parks the queue in a paused state immediately after speak().
    setTimeout(() => {
      try {
        if (synth.paused) synth.resume();
      } catch {
        /* ignore */
      }
    }, 60);
  } catch {
    // Speech synthesis unavailable — the duplicate buzzer still plays.
  }
}

export function feedback(tone: FeedbackTone): void {
  if (tone === "duplicate") {
    // Always play the distinct buzzer (Web Audio — reliable on iPad, same path
    // as the success tone) so the repeat scan is unmistakable even if speech
    // synthesis is blocked. Layer the spoken "Re-entry" on top when it works.
    playBeep("duplicate");
    speak("Re-entry");
  } else {
    playBeep(tone);
  }
  vibrate(tone);
}
