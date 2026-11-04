import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/colors";
import { cardShadow } from "@/constants/effects";
import {
  annualSavingRupees,
  PLAN_ORDER,
  PLANS,
  priceFor,
  type Cycle,
  type PlanId,
} from "@/lib/plans";
import { useT } from "@/components/i18n/LanguageProvider";

import { themed } from "@/theme";

type Props = {
  plan: PlanId;
  cycle: Cycle;
  onChoose: (plan: PlanId, cycle: Cycle) => void;
  onCycleChange: (cycle: Cycle) => void;
};

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * The membership choice, asked before any field exists — so the field counter
 * on the next step can be capped at what the farmer just agreed to rather than
 * letting them enter five plots and then telling them two.
 *
 * Reads PLANS straight from lib/plans.ts, which is the same object the website
 * renders its cards from and the server enforces against. A card advertising a
 * number the server does not honour is the one failure that file exists to
 * prevent, so nothing here hardcodes a price or a limit.
 *
 * Nothing is charged here and no payment details are taken. Choosing a paid
 * tier records the intent on the profile; the server is what enforces it.
 */
export function StepPlan({ plan, cycle, onChoose, onCycleChange }: Props) {
  const { t } = useT();

  return (
    <View>
      <View style={styles.cycleRow}>
        {(["monthly", "annual"] as Cycle[]).map((c) => {
          const active = c === cycle;
          return (
            <Pressable
              key={c}
              onPress={() => onCycleChange(c)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.cycleTab, active && styles.cycleTabActive]}
            >
              <Text style={[styles.cycleText, active && styles.cycleTextActive]}>
                {c === "monthly" ? t("plans.cycle.monthly") : t("plans.cycle.annual")}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {PLAN_ORDER.map((id) => {
        const p = PLANS[id];
        const selected = id === plan;
        const perMonth = cycle === "annual" ? Math.round(p.priceAnnual / 12) : p.priceMonthly;
        const saving = cycle === "annual" ? annualSavingRupees(p) : 0;
        const highlights = p.features.filter((f) => f.onCard);

        return (
          <Pressable
            key={id}
            onPress={() => onChoose(id, cycle)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.card, cardShadow, selected && styles.cardSelected]}
          >
            <View style={styles.head}>
              <View style={styles.headText}>
                <Text style={styles.name}>{t(p.nameKey)}</Text>
                <Text style={styles.tagline}>{t(p.taglineKey)}</Text>
              </View>
              {p.popular ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{t("plans.badge.popular")}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.priceRow}>
              {p.priceMonthly === 0 ? (
                <Text style={styles.price}>{t("plans.price.free")}</Text>
              ) : (
                <>
                  <Text style={styles.price}>{rupees(perMonth)}</Text>
                  <Text style={styles.priceUnit}>{t("plans.price.perMonth")}</Text>
                </>
              )}
              {/*
                The yearly price is stated in full beside the per-month figure.
                A tier that advertises "₹134/month" and bills ₹1,609 once has
                not told the farmer what leaves their account.
              */}
              {saving > 0 ? (
                <Text style={styles.saving}>
                  {`${rupees(priceFor(p, "annual"))}${t("plans.price.perYear")} · ${t("plans.badge.saveRupees", { n: saving.toLocaleString("en-IN") })}`}
                </Text>
              ) : null}
            </View>

            <Text style={styles.audience}>{t(p.audienceKey)}</Text>

            <View style={styles.bullets}>
              {highlights.map((f) => (
                <View key={f.key} style={styles.bulletRow}>
                  <Text style={styles.tick}>✓</Text>
                  <Text style={styles.bulletText}>
                    {typeof f.value === "string" ? t(f.value) : t(f.labelKey)}
                  </Text>
                </View>
              ))}
            </View>

            <View style={[styles.cta, selected && styles.ctaSelected]}>
              <Text style={[styles.ctaText, selected && styles.ctaTextSelected]}>
                {selected ? t("plans.badge.current") : t("plans.cta.choose", { name: t(p.nameKey) })}
              </Text>
            </View>
          </Pressable>
        );
      })}

      {/*
        Said plainly, because a farmer tapping a ₹299 card on their own phone
        has every reason to think they are about to be charged for it.
      */}
      <Text style={styles.footnote}>{t("plans.disclaimer")}</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  cycleRow: {
    flexDirection: "row",
    backgroundColor: colors.sage,
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  cycleTab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  cycleTabActive: { backgroundColor: colors.surface },
  cycleText: { fontSize: 14, fontWeight: "700", color: colors.textFaint },
  cycleTextActive: { color: colors.primary },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  cardSelected: { borderColor: colors.primary },

  head: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  headText: { flex: 1 },
  name: { fontSize: 18, fontWeight: "800", color: colors.ink },
  tagline: { fontSize: 13, color: colors.textFaint, marginTop: 2 },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: colors.surface, letterSpacing: 0.6 },

  priceRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 4, marginTop: 14 },
  price: { fontSize: 26, fontWeight: "800", color: colors.ink },
  priceUnit: { fontSize: 13, color: colors.textFaint },
  saving: { width: "100%", fontSize: 12, color: colors.primary, marginTop: 4 },

  audience: { fontSize: 12, color: colors.textFaint, marginTop: 8 },

  bullets: { marginTop: 14, gap: 8 },
  bulletRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  tick: { fontSize: 13, color: colors.primary, fontWeight: "800", lineHeight: 19 },
  bulletText: { flex: 1, fontSize: 14, color: colors.ink, lineHeight: 19 },

  cta: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.sage,
  },
  ctaSelected: { backgroundColor: colors.primary },
  ctaText: { fontSize: 14, fontWeight: "700", color: colors.ink },
  ctaTextSelected: { color: colors.surface },

  footnote: { fontSize: 12, color: colors.textFaint, lineHeight: 18, marginTop: 4, marginBottom: 8 },
}));
