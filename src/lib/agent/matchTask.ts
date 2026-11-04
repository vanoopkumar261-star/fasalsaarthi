/**
 * Which of today's tasks did the farmer just describe?
 *
 * mark_task_done normally gets a position in the numbered list the Today
 * screen put in the turn's context. Away from that screen there is no list to
 * count, so the model sends words instead ("the nitrogen one") and this
 * resolves them.
 *
 * Its own module, with no imports: tools.ts reaches Supabase and the
 * dashboard, which drags react-native in behind it and makes the function
 * untestable outside the app. Nothing here touches the network or the device,
 * so it runs under plain `tsx` — see matchTask.test.ts.
 */

/**
 * Scores each task by how many of the farmer's words appear in its title, and
 * refuses on a tie or a zero score rather than guessing.
 *
 * Deliberately crude — no stemming, no fuzzy distance. The failure mode being
 * avoided is not "missed a match", which costs the farmer one more sentence;
 * it is "ticked off the wrong job", which tells them work is done that isn't.
 * A tie means two tasks fit equally well and the right answer is to ask again.
 */
export function matchTask<T extends { title: string }>(tasks: T[], said: string): T | null {
  // Words of three letters or more: "on", "my", "the" match everything and
  // would turn every tie-break into noise. \p{L} so Devanagari counts too.
  const words = said
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2);
  if (!words.length) return null;

  const scored = tasks.map((task) => {
    const title = task.title.toLowerCase();
    return { task, score: words.filter((w) => title.includes(w)).length };
  });

  const best = Math.max(...scored.map((s) => s.score));
  if (best === 0) return null;

  const winners = scored.filter((s) => s.score === best);
  return winners.length === 1 ? winners[0].task : null;
}
