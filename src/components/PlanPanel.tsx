import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";

import { getPlanState, setPlan as savePlan, type PlanUsage } from "@/lib/plan";
import {
  annualSavingRupees,
  isUnlimited,
  PLAN_ORDER,
  PLANS,
  priceFor,
  type Cycle,
  type PlanId,
  type Quota,
} from "@/lib/plans";
import { useT } from "./i18n/LanguageProvider";
import { cardShadow, colors, radius, space, tabularNums, type, themed } from "@/theme";

/**
 * "Your plan" in Settings — what the farmer is on, what they have used this
 * month, and how to change it.
 *
 * The meters are the honest half of a quota. A farmer about to be refused
 * their fourth scan should see that coming rather than discover it with a leaf
 * photo already taken, so this reads the same counters the server enforces.
 *
 * Until this existed, the tier chosen during registration was the last the app
 * ever mentioned it: no way to see it, no way to change it.
 */

const METERS: {
  feature: keyof PlanUsage;
  quota: "diseaseScans" | "assistantQueries" | "liveLookups";
  labelKey: string;
}[] = [
  { feature: "disease_scan", quota: "diseaseScans", labelKey: "plans.f.scans" },
  { feature: "assistant_query", quota: "assistantQueries", labelKey: "plans.f.assistant" },
  { feature: "live_lookup", quota: "liveLookups", labelKey: "plans.f.liveMandi" },
];

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function PlanPanel() {
  const { t } = useT();
  const [plan, setPlanId] = useState<PlanId>("free");
  const [cycle, setCycle] = useState<Cycle>("annual");
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  const [limits, setLimits] = useState<Record<string, Quota> | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const s = await getPlanState();
    if (!alive.current || !s) return;
    setPlanId(s.plan);
    if (s.cycle) setCycle(s.cycle);
    setUsage(s.usage);
    setLimits(s.limits as Record<string, Quota> | null);
  }, []);

  useEffect(() => {
    // Same shape as every other screen's loader here: guarded against the
    // panel being unmounted before /api/plan answers. The lint rule objects to
    // setState reachable from an effect at all, and fires on the existing
    // screens too; matching them beats inventing a local exception.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().finally(() => {
      if (alive.current) setLoading(false);
    });
  }, [load]);

  async function choose(next: PlanId) {
    if (next === plan || busy) return;
    setBusy(next);
    setError(null);
    const err = await savePlan(next, cycle);
    if (!alive.current) return;
    setBusy(null);
    if (err) {
      // A refused downgrade is the server telling the farmer something true —
      // they have more fields than the smaller tier allows. Show it as it came.
      setError(err);
      return;
    }
    setPlanId(next);
    setOpen(false);
    await load();
  }

  const current = PLANS[plan];

  return (
    <View style={[styles.card, cardShadow]}>
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>{t("plans.panel.title")}</Text>
          <Text style={styles.subtitle}>{t("plans.panel.subtitle")}</Text>
        </View>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
      </View>

      <View style={styles.currentRow}>
        <Text style={styles.currentName}>{t(current.nameKey)}</Text>
        <View style={styles.currentBadge}>
          <Text style={styles.currentBadgeText}>{t("plans.badge.current")}</Text>
        </View>
      </View>

      {/* Meters, for the quotas that actually have a ceiling. An unlimited row
          would be a bar that can never move, which teaches nothing. */}
      {usage && limits ? (
        <View style={styles.meters}>
          {METERS.map((m) => {
            const limit = limits[m.quota];
            if (limit === undefined) return null;
            const used = usage[m.feature] ?? 0;
            if (isUnlimited(limit)) {
              return (
                <View key={m.quota} style={styles.meterRow}>
                  <Text style={styles.meterLabel}>{t(m.labelKey)}</Text>
                  <Text style={styles.meterValue}>{t("plans.v.unlimited")}</Text>
                </View>
              );
            }
            if (limit === 0) {
              return (
                <View key={m.quota} style={styles.meterRow}>
                  <Text style={styles.meterLabel}>{t(m.labelKey)}</Text>
                  <Text style={styles.meterMuted}>{t("plans.meter.notIncluded")}</Text>
                </View>
              );
            }
            const pct = Math.min(100, (used / limit) * 100);
            return (
              <View key={m.quota} style={styles.meter}>
                <View style={styles.meterRow}>
                  <Text style={styles.meterLabel}>{t(m.labelKey)}</Text>
                  <Text style={styles.meterValue}>
                    {used} / {limit}
                  </Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      { width: `${pct}%`, backgroundColor: pct >= 90 ? colors.critical : colors.primary },
                    ]}
                  />
                </View>
              </View>
            );
          })}
          <Text style={styles.resets}>{t("plans.meter.resets")}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        style={styles.changeBtn}
      >
        <Text style={styles.changeText}>
          {open ? t("plans.panel.hide") : t("plans.panel.change")}
        </Text>
      </Pressable>

      {open ? (
        <View style={styles.chooser}>
          <View style={styles.cycleRow}>
            {(["monthly", "annual"] as Cycle[]).map((c) => (
              <Pressable
                key={c}
                onPress={() => setCycle(c)}
                accessibilityRole="button"
                accessibilityState={{ selected: c === cycle }}
                style={[styles.cycleTab, c === cycle && styles.cycleTabActive]}
              >
                <Text style={[styles.cycleText, c === cycle && styles.cycleTextActive]}>
                  {c === "monthly" ? t("plans.cycle.monthly") : t("plans.cycle.annual")}
                </Text>
              </Pressable>
            ))}
          </View>

          {PLAN_ORDER.map((id) => {
            const p = PLANS[id];
            const isCurrent = id === plan;
            const perMonth = cycle === "annual" ? Math.round(p.priceAnnual / 12) : p.priceMonthly;
            const saving = cycle === "annual" ? annualSavingRupees(p) : 0;
            return (
              <Pressable
                key={id}
                onPress={() => choose(id)}
                disabled={isCurrent || busy !== null}
                accessibilityRole="button"
                accessibilityState={{ selected: isCurrent, disabled: isCurrent }}
                style={[styles.option, isCurrent && styles.optionCurrent]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.optionName}>{t(p.nameKey)}</Text>
                  <Text style={styles.optionPrice}>
                    {p.priceMonthly === 0
                      ? t("plans.price.free")
                      : `${rupees(perMonth)}${t("plans.price.perMonth")}` +
                        (saving > 0
                          ? ` · ${rupees(priceFor(p, "annual"))}${t("plans.price.perYear")}`
                          : "")}
                  </Text>
                </View>
                {busy === id ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.optionCta}>
                    {isCurrent ? t("plans.cta.current") : t("plans.cta.switch")}
                  </Text>
                )}
              </Pressable>
            );
          })}

          <Text style={styles.disclaimer}>{t("plans.disclaimer")}</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  title: { ...type.card, color: colors.text, fontWeight: "800" },
  subtitle: { ...type.secondary, color: colors.textMuted, marginTop: 2 },

  currentRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  currentName: { ...type.section, color: colors.text, fontWeight: "800" },
  currentBadge: {
    backgroundColor: colors.leafSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  currentBadgeText: { ...type.meta, color: colors.primary, fontWeight: "700" },

  meters: { gap: space.xs, marginTop: 2 },
  meter: { gap: 4 },
  meterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  meterLabel: { ...type.secondary, color: colors.textSecondary, flex: 1, minWidth: 0 },
  meterValue: { ...type.secondary, ...tabularNums, color: colors.text, fontWeight: "700" },
  meterMuted: { ...type.secondary, color: colors.textMuted },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.bgSunken, overflow: "hidden" },
  fill: { height: 6, borderRadius: radius.pill },
  resets: { ...type.meta, color: colors.textMuted, marginTop: 2 },

  changeBtn: {
    marginTop: 2,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: "center",
  },
  changeText: { ...type.secondary, color: colors.primary, fontWeight: "700" },

  chooser: { gap: space.xs, marginTop: space.xs },
  cycleRow: {
    flexDirection: "row",
    backgroundColor: colors.bgSunken,
    borderRadius: radius.card,
    padding: 4,
  },
  cycleTab: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: "center" },
  cycleTabActive: { backgroundColor: colors.surface },
  cycleText: { ...type.secondary, color: colors.textMuted, fontWeight: "700" },
  cycleTextActive: { color: colors.primary },

  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
  },
  optionCurrent: { borderColor: colors.primary, backgroundColor: colors.leafSoft },
  optionName: { ...type.body, color: colors.text, fontWeight: "700" },
  optionPrice: { ...type.meta, color: colors.textMuted, marginTop: 1 },
  optionCta: { ...type.secondary, color: colors.primary, fontWeight: "700" },

  disclaimer: { ...type.meta, color: colors.textMuted, lineHeight: 16, marginTop: 2 },
  error: { ...type.secondary, color: colors.danger, marginTop: 2 },
}));
