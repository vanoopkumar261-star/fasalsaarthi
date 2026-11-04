/**
 * Where the tour should point.
 *
 * The web tour finds its targets with `document.querySelector('[data-tour=…]')`
 * and `getBoundingClientRect()`. React Native has neither, and the obvious
 * substitute — wrapping every target in a measuring View — does not fit the
 * hub: three of its steps point at an *arc* of five nodes, which is not a
 * single element at all.
 *
 * So targets are published instead of discovered. The hub already computes
 * every node position in JS (hubLayout.ts), so it can hand over exact rects
 * for the arcs and the core, and measure the two chrome buttons that sit
 * outside its own container. A step whose target was never published is
 * dropped before the tour starts, which is the same mechanism the web uses to
 * skip its sidebar step on a narrow screen.
 */

export type TourRect = { x: number; y: number; width: number; height: number };

const targets = new Map<string, TourRect>();
const listeners = new Set<() => void>();

export function setTourTarget(id: string, rect: TourRect | null): void {
  if (rect) targets.set(id, rect);
  else targets.delete(id);
  listeners.forEach((l) => l());
}

export function getTourTarget(id: string): TourRect | null {
  return targets.get(id) ?? null;
}

export function hasTourTarget(id: string): boolean {
  const r = targets.get(id);
  // A zero-sized rect counts as absent, matching the web's rule that an
  // element has to actually MEASURE before a step may point at it — that is
  // what drops a step for something rendered but collapsed.
  return Boolean(r && r.width > 0 && r.height > 0);
}

export function subscribeTourTargets(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Bringing an off-screen target into view.
 *
 * Two of the tour's targets live below the fold on a short phone — the "More"
 * sheet always does. `measureInWindow` still reports them, with a y past the
 * bottom of the window, and a rect being *reported* is not the same as it
 * being *visible*: pointing a spotlight at y=2600 on a 2340px screen dims the
 * whole screen, cuts a hole nobody can see, and (before placeCard learned to
 * clamp) parked the card and its Next button off the bottom edge. The tour
 * looked like it had died.
 *
 * So the screen that owns the scroll container registers how to reveal a
 * target, and the tour asks before it draws the step. The screen re-publishes
 * its rects once the scroll settles, which is what makes the second
 * measurement the accurate one.
 *
 * Registration is optional: with no scroller the tour falls back to dropping
 * any step whose target it cannot bring on screen, which is the same
 * "unanchored steps are skipped" rule it already applies.
 */
type Scroller = (id: string) => Promise<void>;

let scroller: Scroller | null = null;

export function setTourScroller(fn: Scroller | null): void {
  scroller = fn;
}

/** Asks the owning screen to scroll `id` into view. Resolves either way. */
export async function revealTourTarget(id: string): Promise<void> {
  if (!scroller) return;
  try {
    await scroller(id);
  } catch {
    /* a failed scroll is not worth trapping anyone over */
  }
}

/** Is this rect actually within the window, far enough in to be worth pointing at? */
export function isOnScreen(r: TourRect | null, windowHeight: number): boolean {
  if (!r || r.width <= 0 || r.height <= 0) return false;
  // Require the top edge on screen and at least 24dp of the target visible:
  // a strip of a card peeking over the bottom edge is not something a farmer
  // can see highlighted.
  return r.y >= 0 && r.y + Math.min(r.height, 24) <= windowHeight;
}
