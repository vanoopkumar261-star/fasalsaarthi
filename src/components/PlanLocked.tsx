import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";

import { PLANS, type FeatureKey, type PlanId } from "@/lib/plans";
import { useT } from "./i18n/LanguageProvider";
import { cardShadow, colors, radius, space, type, themed } from "@/theme";

/**
 * What a farmer sees instead of a feature their plan does not include.
 *
 * Deliberately not a redirect. Someone who taps "Irrigation" wants to know
 * what irrigation does; bouncing them to Settings answers a question they did
 * not ask and teaches them nothing about what they would be buying. So the
 * screen explains the feature, names the tier, and offers one way on.
 *
 * Ported from the website's PlanLocked, including that reasoning. The app had
 * no gate at all — every paid feature simply opened on the free tier, so a
 * farmer could never find out what a tier was for.
 */
export function PlanLocked({
  currentPlan,
  requiredPlan,
  titleKey,
  bodyKey,
}: {
  currentPlan: PlanId;
  requiredPlan: PlanId;
  titleKey: string;
  bodyKey: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const required = PLANS[requiredPlan];
  const highlights = required.features.filter((f) => f.onCard).slice(0, 5);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={[styles.card, cardShadow]}>
        <View style={styles.lock}>
          <MaterialCommunityIcons name="lock-outline" size={22} color={colors.primary} />
        </View>

        <Text style={styles.title}>{t(titleKey)}</Text>
        <Text style={styles.body}>{t(bodyKey)}</Text>

        <View style={styles.planRow}>
          <Text style={styles.planName}>{t(required.nameKey)}</Text>
          <Text style={styles.planPrice}>
            {required.priceMonthly === 0
              ? t("plans.price.free")
              : `₹${required.priceMonthly.toLocaleString("en-IN")}${t("plans.price.perMonth")}`}
          </Text>
        </View>

        <View style={styles.bullets}>
          {highlights.map((f) => (
            <View key={f.key} style={styles.bulletRow}>
              <MaterialCommunityIcons name="check" size={15} color={colors.primary} />
              <Text style={styles.bulletText}>
                {typeof f.value === "string" ? t(f.value) : t(f.labelKey)}
              </Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => router.push("/(app)/settings" as never)}
          accessibilityRole="button"
          style={styles.cta}
        >
          <Text style={styles.ctaText}>{t("plans.locked.cta")}</Text>
        </Pressable>

        <Text style={styles.current}>{t(PLANS[currentPlan].nameKey)}</Text>
      </View>
    </ScrollView>
  );
}

/** The gate a screen applies. Null means the feature is open on this tier. */
export type Gate = { requiredPlan: PlanId; titleKey: string; bodyKey: string } | null;

/** Feature → the cheapest tier that includes it, with the copy to explain it. */
export const GATES: Partial<Record<FeatureKey, { requiredPlan: PlanId; titleKey: string; bodyKey: string }>> = {
  irrigation: {
    requiredPlan: "pro",
    titleKey: "plans.locked.irrigation.title",
    bodyKey: "plans.locked.irrigation.body",
  },
  expenses: {
    requiredPlan: "pro",
    titleKey: "plans.locked.expenses.title",
    bodyKey: "plans.locked.expenses.body",
  },
};

const styles = themed(() => StyleSheet.create({
  container: { padding: space.md, paddingTop: space.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
    alignItems: "center",
  },
  lock: {
    width: 44,
    height: 44,
    borderRadius: radius.card,
    backgroundColor: colors.leafSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.section, color: colors.text, fontWeight: "800", textAlign: "center" },
  body: { ...type.secondary, color: colors.textSecondary, textAlign: "center", lineHeight: 19 },

  planRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.xs,
    marginTop: space.xs,
  },
  planName: { ...type.body, color: colors.text, fontWeight: "800" },
  planPrice: { ...type.secondary, color: colors.textMuted },

  bullets: { alignSelf: "stretch", gap: 7, marginTop: space.xs },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  bulletText: { ...type.secondary, flex: 1, minWidth: 0, color: colors.text, lineHeight: 19 },

  cta: {
    alignSelf: "stretch",
    marginTop: space.sm,
    borderRadius: radius.card,
    backgroundColor: colors.primary,
    paddingVertical: 13,
    alignItems: "center",
  },
  ctaText: { ...type.body, color: colors.onPrimary, fontWeight: "700" },

  current: { ...type.meta, color: colors.textMuted },
}));
