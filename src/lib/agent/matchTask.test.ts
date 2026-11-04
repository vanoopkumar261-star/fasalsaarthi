/**
 * matchTask decides which of today's tasks a spoken description refers to,
 * for the case where mark_task_done is called away from the Today screen and
 * there is no numbered list to index into.
 *
 * The refusals matter more than the matches here: ticking off the wrong task
 * is worse than asking the farmer again, so an ambiguous or empty match must
 * return null rather than its best guess.
 */
import { matchTask } from "./matchTask";

const TASKS = [
  { title: "Irrigate Farm 1 (cotton, 12 days since last watering)" },
  { title: "Top-dress nitrogen on Farm 1" },
  { title: "Check Farm 2 for shoot fly" },
];

const CASES: [said: string, wantTitle: string | null][] = [
  // Verbatim, which is what the model actually sends when it has the list.
  ["Top-dress nitrogen on Farm 1", "Top-dress nitrogen on Farm 1"],
  // Paraphrased, which is what it sends when it does not.
  ["the nitrogen one", "Top-dress nitrogen on Farm 1"],
  ["watering farm 1", "Irrigate Farm 1 (cotton, 12 days since last watering)"],
  ["shoot fly", "Check Farm 2 for shoot fly"],
  // "farm 1" fits two tasks equally well — refuse rather than pick one.
  ["farm 1", null],
  ["ploughing the back field", null],
  // Nothing over two letters, so nothing to match on.
  ["ok", null],
];

let failed = 0;
for (const [said, want] of CASES) {
  const got = matchTask(TASKS, said)?.title ?? null;
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  "${said}" -> ${got ?? "(refused)"}`);
}

console.log(`\n${CASES.length - failed}/${CASES.length} passed`);
if (failed) process.exitCode = 1;
