import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { cardShadow, colors, radius, space, type } from "@/theme";
import { markTourSeen } from "@/lib/tour";
import { useT } from "../i18n/LanguageProvider";
import { TOUR_STEPS, type TourStep } from "./steps";
import {
  getTourTarget,
  hasTourTarget,
  isOnScreen,
  revealTourTarget,
  type TourRect,
} from "./tourTargets";

const CARD_WIDTH = 300;
const MARGIN = 12;
/** Below this the "hole" is too small to read as a pointer, so don't cut one. */
const MIN_SPOT = 24;
const SCRIM = "rgba(23,59,42,0.62)";

/**
 * The first-run tutorial, over the hub.
 *
 * One invariant, the same one the web version is built on: **it can never trap
 * anyone.** A missing target, a bad measurement or a failed write all end with
 * the overlay closed. Skip is on every step and on the back button, and
 * markTourSeen() is fired without being awaited and never gates the close — a
 * farmer stuck under a dimmed screen is a far worse failure than a tour that
 * appears once more than it should.
 *
 * Steps are filtered ONCE, on mount. Recomputing mid-tour would renumber them
 * if the phone rotated, and "3 of 6" turning into "3 of 7" mid-sentence is
 * worse than one stale count.
 *
 * The dim is four panels around the highlight rather than one element with a
 * giant border. RN will render a 9999dp border, which is the trick the web
 * uses, but it is a shadow-less approximation there and a real layout box
 * here — four explicit panels cannot overflow into a scroll container or get
 * clipped by one.
 */
export function HubTour({ farmerId, onClose }: { farmerId: string; onClose: () => void }) {
  const { t } = useT();
  const { width, height } = useWindowDimensions();

  /**
   * The step list, resolved once the screen has actually published its rects.
   *
   * This was a `useMemo(…, [])`, which ran during the first render — before
   * any `onLayout` had fired, so `hasTourTarget` answered false for every
   * target and the only steps to survive were the two unanchored ones. That
   * tripped the `length <= 2` guard below, which closed the tour and marked
   * it seen. It mostly got away with it because the tour is mounted from an
   * async dashboard load, late enough that layout had usually happened — so
   * whether the tutorial existed at all came down to a race.
   *
   * `null` means "still resolving": render nothing rather than guess.
   */
  const [steps, setSteps] = useState<TourStep[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Anchored steps are the entire point of the tour, so waiting a moment
      // for layout beats resolving instantly to a two-card tour that explains
      // nothing.
      const deadline = Date.now() + 2500;
      while (!cancelled && Date.now() < deadline) {
        if (TOUR_STEPS.some((s) => s.target && hasTourTarget(s.target))) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!cancelled) {
        setSteps(TOUR_STEPS.filter((s) => s.target === null || hasTourTarget(s.target)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [index, setIndex] = useState(0);

  /**
   * Where to cut the hole for the current step.
   *
   * State set from an effect, not a value derived during render, because a
   * target below the fold has to be scrolled into view first and that is
   * asynchronous. While it is null the whole screen dims and the card
   * centres — which is also the honest rendering for a target that could not
   * be brought on screen at all.
   */
  const [spot, setSpot] = useState<TourRect | null>(null);

  const finish = useCallback(() => {
    void markTourSeen(farmerId);
    onClose();
  }, [farmerId, onClose]);

  const step: TourStep | null = steps ? steps[index] ?? null : null;
  const target = step?.target ?? null;

  useEffect(() => {
    let cancelled = false;
    setSpot(null);
    if (!target) return;
    (async () => {
      await revealTourTarget(target);
      if (cancelled) return;
      const r = getTourTarget(target);
      // A rect the screen reported but could not bring on screen is not
      // something to point at: dim everything and let the card speak.
      if (!r || !isOnScreen(r, height)) return;
      if (r.width >= MIN_SPOT && r.height >= MIN_SPOT) setSpot(inset(r, width, height));
    })();
    return () => {
      cancelled = true;
    };
  }, [target, width, height]);

  // Nothing anchored survived, so there is nothing to point at. Close rather
  // than walk someone through a screen we could not find — and do it in an
  // effect, because closing during render would be a side effect in render.
  const nothingToShow = steps !== null && steps.length <= 2;
  useEffect(() => {
    if (nothingToShow) finish();
  }, [nothingToShow, finish]);
  if (nothingToShow || !steps || !step) return null;

  // Captured after the null guard above so the closure keeps the narrowing.
  const total = steps.length;

  function next() {
    if (index >= total - 1) finish();
    else setIndex(index + 1);
  }

  const cardTop = placeCard(spot, height);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={finish} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill} accessibilityLabel={t("tour.aria")}>
        {spot ? (
          <>
            <View style={[styles.scrim, { left: 0, top: 0, width, height: spot.y }]} />
            <View
              style={[
                styles.scrim,
                { left: 0, top: spot.y + spot.height, width, height: Math.max(0, height - spot.y - spot.height) },
              ]}
            />
            <View style={[styles.scrim, { left: 0, top: spot.y, width: spot.x, height: spot.height }]} />
            <View
              style={[
                styles.scrim,
                {
                  left: spot.x + spot.width,
                  top: spot.y,
                  width: Math.max(0, width - spot.x - spot.width),
                  height: spot.height,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.ring,
                { left: spot.x, top: spot.y, width: spot.width, height: spot.height },
              ]}
            />
          </>
        ) : (
          <View style={[styles.scrim, { left: 0, top: 0, width, height }]} />
        )}

        <View style={[styles.card, cardShadow, { width: CARD_WIDTH, left: (width - CARD_WIDTH) / 2, top: cardTop }]}>
          <Text style={styles.counter}>
            {t("tour.stepCounter", { n: index + 1, total: steps.length })}
          </Text>
          <Text style={styles.title}>{t(step.titleKey)}</Text>
          <Text style={styles.body}>{t(step.bodyKey)}</Text>

          {/* A wordless "how much is left", which matters when the farmer may
              not be reading the counter. */}
          <View style={styles.dots}>
            {steps.map((s, i) => (
              <View key={s.id} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable onPress={finish} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.skip}>{t("tour.skip")}</Text>
            </Pressable>

            <View style={styles.actionsRight}>
              {index > 0 && (
                <Pressable
                  onPress={() => setIndex(index - 1)}
                  accessibilityRole="button"
                  style={styles.backBtn}
                >
                  <Text style={styles.backText}>{t("tour.back")}</Text>
                </Pressable>
              )}
              <Pressable onPress={next} accessibilityRole="button" style={styles.nextBtn}>
                <Text style={styles.nextText}>
                  {index >= steps.length - 1 ? t("tour.finish") : t("tour.next")}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Pads the hole slightly and clamps it to the screen. */
function inset(r: TourRect, width: number, height: number): TourRect {
  const pad = 6;
  const x = Math.max(0, r.x - pad);
  const y = Math.max(0, r.y - pad);
  return {
    x,
    y,
    // Never negative. A target measured below the fold reports a y past the
    // bottom of the window, and `height - y` then goes negative — which RN
    // renders as a collapsed scrim and used to feed a nonsense card position.
    width: Math.max(0, Math.min(width - x, r.width + pad * 2)),
    height: Math.max(0, Math.min(height - y, r.height + pad * 2)),
  };
}

/**
 * Below the highlight when it fits, otherwise above — and clamped to the
 * window either way.
 *
 * The clamp is the fix for the tour appearing to die on step 3. With a target
 * measured off the bottom of the screen, `above` worked out just past the
 * window height and passed the `>= MARGIN` test, so the card — and the Next
 * button on it — rendered below the bottom edge. The farmer saw a dimmed
 * screen with no way forward and no way out.
 */
function placeCard(spot: TourRect | null, height: number): number {
  const CARD_H = 240;
  const lowest = Math.max(MARGIN, height - CARD_H - MARGIN);
  const clamp = (v: number) => Math.min(Math.max(MARGIN, v), lowest);
  if (!spot) return clamp((height - CARD_H) / 2);
  const below = spot.y + spot.height + MARGIN;
  if (below + CARD_H + MARGIN <= height) return below;
  return clamp(spot.y - CARD_H - MARGIN);
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", backgroundColor: SCRIM },
  ring: {
    position: "absolute",
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  card: {
    position: "absolute",
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.md,
  },
  counter: { ...type.meta, color: colors.textMuted, letterSpacing: 0.6 },
  title: { ...type.card, fontWeight: "800", color: colors.text, marginTop: 4 },
  body: { ...type.secondary, color: colors.textSecondary, marginTop: 6, lineHeight: 19 },
  dots: { flexDirection: "row", gap: 5, marginTop: space.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 16 },
  actions: {
    marginTop: space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actionsRight: { flexDirection: "row", alignItems: "center", gap: space.xs },
  skip: { ...type.meta, color: colors.textMuted, fontWeight: "600" },
  backBtn: { paddingHorizontal: space.sm, paddingVertical: 8 },
  backText: { ...type.secondary, color: colors.text, fontWeight: "700" },
  nextBtn: {
    paddingHorizontal: space.md,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  nextText: { ...type.secondary, color: colors.onPrimary, fontWeight: "800" },
});
