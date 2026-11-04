// Run: npx tsx src/lib/agent/vad.test.ts
import { VAD, vadStart, vadStep, type VadVerdict } from "./vad";

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`vad check failed: ${msg}`);
}

/** Feeds `ms` of a constant level at 100 ms ticks; returns the first non-continue verdict. */
function run(segments: [db: number, ms: number][]): { verdict: VadVerdict; at: number } {
  let s = vadStart(0);
  let now = 0;
  for (const [db, ms] of segments) {
    for (let t = 0; t < ms; t += 100) {
      now += 100;
      const r = vadStep(s, db, now, 100);
      s = r.state;
      if (r.verdict !== "continue") return { verdict: r.verdict, at: now };
    }
  }
  return { verdict: "continue", at: now };
}

const ROOM = -55;
const VOICE = -25;

// A spoken question ends one silence-window after the speech stops.
// Derived from VAD.SILENCE_MS rather than written out, because the previous
// hardcoded 4300 was really an assertion about a 1300 ms threshold wearing the
// costume of an assertion about behaviour — it failed the moment the threshold
// was tuned, which told us nothing about whether the detector still worked.
const endsAt = 1000 + 2000 + VAD.SILENCE_MS;
const q = run([[ROOM, 1000], [VOICE, 2000], [ROOM, 3000]]);
check(q.verdict === "done", "question ends");
check(q.at >= endsAt && q.at <= endsAt + 100, `ended at ${q.at}, expected about ${endsAt}`);

// A 200 ms knock is not a question: still listening afterwards.
check(run([[ROOM, 1000], [VOICE, 200], [ROOM, 3000]]).verdict === "continue", "knock ignored");

// ...and real speech after the knock still counts.
check(run([[ROOM, 1000], [VOICE, 200], [ROOM, 2000], [VOICE, 1500], [ROOM, 2000]]).verdict === "done", "speech after knock");

// Twenty seconds of a quiet room puts the loop to sleep.
const quiet = run([[ROOM, 25_000]]);
check(quiet.verdict === "sleep" && quiet.at === 20_000, "quiet room sleeps at 20 s");

// A loud but steady room (generator) is learned as noise, not speech.
check(run([[-30, 25_000]]).verdict === "sleep", "steady loud room is noise");

// Someone who never stops talking is cut off at 25 s and still answered.
check(run([[ROOM, 500], [VOICE, 30_000]]).verdict === "done", "cut off at 25 s");

// Found on a real phone: the first reading is -160 (no data), then a normal room.
// That must not make the room's noise count as speech.
const startup = run([[-160, 200], [-45, 25_000]]);
check(startup.verdict === "sleep", `startup -160 reading: ${startup.verdict} at ${startup.at}`);
check(run([[-160, 200], [-45, 1000], [-15, 1500], [-45, 2000]]).verdict === "done", "speech after a -160 start");

// A noisy room that keeps creeping louder still ends up learned as noise.
check(run([[-55, 1000], [-38, 25_000]]).verdict !== "continue", "room getting louder");

console.log("vad ok");
