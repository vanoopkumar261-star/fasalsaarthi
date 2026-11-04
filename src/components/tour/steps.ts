/**
 * The tutorial script, for the hub.
 *
 * Data only — the engine in HubTour.tsx reads this and knows nothing about
 * what any step says, so rewriting copy never means touching behaviour. The
 * same arrangement as the web's steps.ts, and the copy keys are the web's
 * too: all of tour.* was already translated into nine languages in the
 * dictionary this repo copied over, so this costs no new strings.
 *
 * `target` is an id published into tourTargets. A step whose target was never
 * published is dropped before the tour starts, which is what lets one script
 * work on a 320dp screen and a tall one without special-casing either.
 *
 * `target: null` is a centred card with no highlight, for the opening and
 * closing beats.
 *
 * The targets were re-pointed when the hub stopped being a ring of nodes and
 * became a scrolling screen with a bottom tab bar. The *copy* survived the
 * change unaltered, because it was always written to name destinations rather
 * than furniture — "the things you need most, one tap each" describes a tile
 * grid exactly as well as it described an arc.
 *
 * Two of the web's nine steps are absent here rather than retargeted:
 * `weather` and `tasks` describe cards that live on the Today screen, not the
 * hub, and pointing them at a card that merely opens Today would be pointing
 * at a door and describing the room behind it.
 */
export type TourStep = {
  id: string;
  target: string | null;
  titleKey: string;
  bodyKey: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    target: null,
    titleKey: "tour.welcome.title",
    bodyKey: "tour.welcome.body",
  },
  {
    // The daily tiles. Was the bottom arc, "the daily five in the thumb zone";
    // the web's copy for this step lists them one tap each, which is still
    // what this grid is.
    id: "quickActions",
    target: "tiles",
    titleKey: "tour.quickActions.title",
    bodyKey: "tour.quickActions.body",
  },
  {
    // The web calls this "sidebar" because that is where the rest of the app
    // lives there; here it is the "More" sheet. The copy names the
    // destinations rather than the furniture, so it travels unchanged.
    id: "sidebar",
    target: "more",
    titleKey: "tour.sidebar.title",
    bodyKey: "tour.sidebar.body",
  },
  {
    // Farm health, weather and alerts at a glance. Was the hub's core.
    id: "stats",
    target: "todayCards",
    titleKey: "tour.stats.title",
    bodyKey: "tour.stats.body",
  },
  {
    // The least discoverable feature in the app and the one that matters most,
    // so it keeps its own beat here exactly as it has on the web.
    id: "alerts",
    target: "bell",
    titleKey: "tour.alerts.title",
    bodyKey: "tour.alerts.body",
  },
  {
    // The microphone in the tab bar. Now the single most important control in
    // the app: it is what the farmer talks to.
    id: "assistant",
    target: "mic",
    titleKey: "tour.assistant.title",
    bodyKey: "tour.assistant.body",
  },
  {
    id: "done",
    target: null,
    titleKey: "tour.done.title",
    bodyKey: "tour.done.body",
  },
];
