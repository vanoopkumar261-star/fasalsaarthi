/**
 * The mic-vs-speaker invariant, made structural instead of a comment.
 *
 * The load-bearing rule inherited from voice.tsx is that the mic is NEVER open
 * while the app is speaking — leave it open and the assistant transcribes its
 * own reply and answers itself forever. Today that rule lives only as a
 * comment in one file. The agent adds three more places that speak (a filler
 * phrase, the answer, an undo confirmation), so it can no longer live as a
 * comment anywhere — it has to be a mutex every caller goes through.
 *
 * Deliberately a plain module-level object, not a React state: audio timing
 * doesn't need a re-render, and a re-render is one more place this could race.
 */
export type AudioState = "idle" | "recording" | "speaking";

let state: AudioState = "idle";
const listeners = new Set<(s: AudioState) => void>();

/**
 * The active recorder's own stop function, registered by whichever component
 * currently holds one (voice.tsx today). This is what lets speech.ts —  which
 * has no reference to any recorder — force one closed on `beginSpeaking()`
 * without every call site having to thread a stop callback through by hand.
 */
let activeRecorderStop: (() => void) | null = null;

function setState(next: AudioState) {
  state = next;
  listeners.forEach((l) => l(next));
}

export function audioState(): AudioState {
  return state;
}

export function onAudioStateChange(listener: (s: AudioState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Call before starting a recording, passing that recorder's own stop
 * function. Throws if the app is speaking or already recording — every
 * caller must let the throw propagate, not swallow it. In development it also
 * fires a loud console.error, because a silent violation here is exactly how
 * the self-transcription loop happened before.
 */
export function beginRecording(stop: () => void): void {
  if (state !== "idle") {
    const msg = `audioLock: beginRecording() called while state="${state}" — refusing, or the mic would transcribe the app's own audio`;
    if (__DEV__) console.error(msg);
    throw new Error(msg);
  }
  activeRecorderStop = stop;
  setState("recording");
}

export function endRecording(): void {
  if (state === "recording") {
    activeRecorderStop = null;
    setState("idle");
  }
}

/**
 * Call before playing any TTS. Idempotent with recording: if a recorder is
 * still active this stops it first via the function it registered with
 * `beginRecording` — speaking always wins over listening — then marks
 * speaking. Safe to call with no recorder active; safe to call from a module
 * (speech.ts) that has never seen the recorder itself.
 */
export function beginSpeaking(): void {
  if (state === "recording") {
    if (__DEV__) console.warn("audioLock: beginSpeaking() while recording — stopping the recorder first");
    try {
      activeRecorderStop?.();
    } catch {
      /* the recorder may already be mid-stop; state still moves to speaking below */
    }
    activeRecorderStop = null;
  }
  setState("speaking");
}

export function endSpeaking(): void {
  if (state === "speaking") setState("idle");
}

/** For tests and the dev-only assertion surface — never call this in app code. */
export function __resetAudioLockForTests(): void {
  activeRecorderStop = null;
  setState("idle");
}
