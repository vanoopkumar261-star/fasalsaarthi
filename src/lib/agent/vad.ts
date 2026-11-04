/**
 * End-of-utterance detection for the always-on voice loop, as a pure step
 * function so it can be checked without a microphone (see vad.test.ts).
 *
 * Same shape as the web voice mode (agent-farmer src/hooks/useVoiceChat.ts),
 * but in decibels: expo-audio's metering reports dBFS (about -160 silent to 0
 * loud), where the web measured RMS. Speech is anything clearly above a
 * running estimate of the room's noise, so a fan or a tractor idling in the
 * yard raises the bar instead of being mistaken for the farmer talking.
 */
export const VAD = {
  MARGIN_DB: 12, // this far above the noise floor counts as speech
  MIN_SPEECH_DB: -50, // and never quieter than this, however silent the room
  NO_DATA_DB: -100, // at or below this the meter has nothing yet
  /*
    Quiet this long after speech ends the utterance.

    Was 1300ms, which is 1.3 seconds of dead air on the front of EVERY reply,
    before a single byte has been uploaded — the largest single contributor to
    "the assistant is slow", and the cheapest to remove because it costs no
    accuracy at a normal speaking pace. 900ms still comfortably clears the
    pause between clauses ("कपास का भाव … क्या है"), which is the thing this
    threshold exists to survive. The real floor is MIN_SPEECH_MS below, which
    is what stops a cough being treated as a question.
  */
  // Raised 900 -> 1100 after real use: farmers (and anyone speaking a second
  // language) pause longer between words than a studio speaker, and the loop was
  // cutting them off mid-sentence. 200ms more latency beats losing half the question.
  SILENCE_MS: 1100,
  MIN_SPEECH_MS: 350, // less speech than this was a cough or a door, not a question
  // An out-loud question is rarely longer than this; past it we are almost
  // certainly stuck on a noisy room, so cut the recording instead of listening
  // on and on. Kept >= SLEEP_MS so a silent session still waits the sleep window.
  MAX_UTTERANCE_MS: 20_000,
  SLEEP_MS: 20_000, // nobody spoke for this long: stop listening until tapped
};

export type VadState = {
  floor: number | null; // null until the first real reading
  speechMs: number;
  lastSpeechAt: number | null;
  startedAt: number;
};

export type VadVerdict = "continue" | "done" | "sleep";

export function vadStart(now: number): VadState {
  return { floor: null, speechMs: 0, lastSpeechAt: null, startedAt: now };
}

/** Feed one meter reading taken `dt` ms after the previous one. */
export function vadStep(s: VadState, db: number, now: number, dt: number): { state: VadState; verdict: VadVerdict } {
  // A recorder's first readings are -160 ("no data yet"). Learning that as the
  // room's noise made every later sound count as speech, on a real phone.
  const valid = db > VAD.NO_DATA_DB;
  const floor = s.floor ?? (valid ? db : null);
  const speaking = floor !== null && db > floor + VAD.MARGIN_DB && db > VAD.MIN_SPEECH_DB;
  // The floor drops fast to a quieter room and rises slowly; slower still while
  // someone talks, so a sentence isn't learned as noise but a fan eventually is.
  const nextFloor =
    floor === null || !valid ? floor : db < floor ? db : floor + (db - floor) * (speaking ? 0.01 : 0.03);

  let { speechMs, lastSpeechAt } = s;
  if (speaking) {
    speechMs += dt;
    lastSpeechAt = now;
  }
  const state = { ...s, floor: nextFloor, speechMs, lastSpeechAt };

  if (lastSpeechAt !== null && now - lastSpeechAt >= VAD.SILENCE_MS) {
    if (speechMs >= VAD.MIN_SPEECH_MS) return { state, verdict: "done" };
    // A blip: forget it and keep listening for real speech.
    return { state: { ...state, speechMs: 0, lastSpeechAt: null }, verdict: "continue" };
  }
  if (now - s.startedAt >= VAD.MAX_UTTERANCE_MS) {
    return { state, verdict: speechMs >= VAD.MIN_SPEECH_MS ? "done" : "sleep" };
  }
  if (lastSpeechAt === null && now - s.startedAt >= VAD.SLEEP_MS) return { state, verdict: "sleep" };
  return { state, verdict: "continue" };
}
