import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { cardShadow, colors, eyebrow, radius, space, type } from "@/theme";
import { cropStageFor, getCropProfile } from "@/lib/agronomy";
import type { FarmWithCrop } from "@/lib/dashboard";
import { soilFix, type SoilAction } from "@/lib/soilFix";
import { phBand } from "@/lib/soilPh";
import { useT } from "./i18n/LanguageProvider";

/**
 * What to do about the measured pH, for the crop that is actually growing.
 *
 * The screen above this answers "what is my pH" and "is that good for my
 * crop". Neither tells a farmer what to *do*, which is the only reason they
 * photographed a meter. The web app answers it with the same `soilFix()`
 * logic, now shared: both clients read one amendment table, so the two can no
 * longer tell the same farmer to buy different amounts of lime.
 *
 * The two-list split is chemistry, not presentation. Lime and gypsum take
 * three to six months to move soil pH, so while a crop is standing the honest
 * answer is that the soil cannot be corrected this season — what works
 * instead is bypassing it, by feeding the leaf and picking a fertiliser that
 * pushes pH the right way. Collapsing the two lists would sell someone a sack
 * of lime for a crop it cannot reach.
 */
export function SoilPhFix({ ph, farms }: { ph: number; farms: FarmWithCrop[] }) {
  const { t } = useT();
  const band = phBand(ph);

  if (farms.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Ionicons name="leaf-outline" size={16} color={colors.primary} />
        <Text style={styles.title}>{t("soilFix.title")}</Text>
        <Text style={[styles.yourPh, { color: band.color }]}>
          {t("soilFix.yourPh", { ph: ph.toFixed(1) })}
        </Text>
      </View>

      {farms.map((f) => (
        <FarmFix key={f.id} ph={ph} farm={f} />
      ))}

      {/* This panel tells someone to buy several hundred kilos of something.
          Saying it is a starting figure, not a prescription, is not boilerplate. */}
      <View style={styles.caveatRow}>
        <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
        <Text style={styles.caveat}>{t("soilFix.caveat")}</Text>
      </View>
    </View>
  );
}

function FarmFix({ ph, farm }: { ph: number; farm: FarmWithCrop }) {
  const { t } = useT();
  const router = useRouter();

  const stage = farm.crop
    ? cropStageFor(farm.crop.chosen_crop, farm.crop.seeding_date, farm.crop.estimated_harvest_date)
    : null;

  const fix = soilFix({
    ph,
    crop: farm.crop?.chosen_crop,
    soilType: farm.soil_type,
    stage,
  });

  const cropName = farm.crop ? getCropProfile(farm.crop.chosen_crop).displayName : "";
  const ok = fix.status === "ok";

  return (
    <View style={[styles.card, cardShadow]}>
      <View style={styles.cardHead}>
        <Text style={styles.farmLabel}>Farm {farm.farm_index}</Text>
        <Text style={styles.cropLine}>
          {farm.crop && stage
            ? t("soilFix.forCrop", { crop: cropName, day: stage.day, cycle: stage.cycleDays })
            : t("soilFix.noCrop")}
        </Text>
      </View>

      <Text style={styles.rangeLine}>
        {t("soilFix.rangeLabel", {
          crop: cropName || t("soilFix.noCrop"),
          min: fix.phMin.toFixed(1),
          max: fix.phMax.toFixed(1),
        })}
      </Text>

      {/* When a crop is standing the heading names it, so the farmer can see
          this is about their wheat and not soil in the abstract. */}
      <Section
        title={
          ok
            ? t("soilFix.nowTitle")
            : fix.cropStanding
              ? t("soilFix.nowTitleStanding", { crop: cropName })
              : t("soilFix.nowTitle")
        }
        actions={fix.now}
        tone={ok ? "ok" : "now"}
      />

      {fix.afterHarvest.length > 0 && (
        <>
          {/* Without this line, "after harvest" reads as a delay rather than a
              fact about how long lime takes to work. */}
          <Text style={styles.whyLater}>{t("soilFix.cannotFixNow")}</Text>
          <Section title={t("soilFix.afterTitle")} actions={fix.afterHarvest} tone="later" />
        </>
      )}

      {!ok && (
        <Pressable
          onPress={() => router.push("/(app)/stores")}
          accessibilityRole="button"
          style={styles.shopRow}
        >
          <Ionicons name="location-outline" size={18} color={colors.primaryDeep} />
          <View style={{ flex: 1 }}>
            <Text style={styles.shopTitle}>{t("soilFix.findShop")}</Text>
            <Text style={styles.shopSub}>{t("soilFix.findShopSub")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.primaryDeep} />
        </Pressable>
      )}
    </View>
  );
}

function Section({
  title,
  actions,
  tone,
}: {
  title: string;
  actions: SoilAction[];
  tone: "ok" | "now" | "later";
}) {
  const { t } = useT();
  if (actions.length === 0) return null;

  const dotColor =
    tone === "ok" ? colors.primary : tone === "now" ? colors.accent : colors.textMuted;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actions.map((a, i) => (
        <View key={i} style={styles.actionRow}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <Text style={styles.actionText}>{t(a.key, a.params)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.lg, gap: space.sm },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  title: { ...type.section, color: colors.text, flexShrink: 1 },
  yourPh: { ...type.meta, fontWeight: "700" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.md,
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: space.sm,
    flexWrap: "wrap",
  },
  farmLabel: { ...eyebrow, color: colors.textMuted },
  cropLine: { ...type.secondary, color: colors.textSecondary, flexShrink: 1 },
  rangeLine: { ...type.meta, color: colors.textMuted, marginTop: 4 },
  section: { marginTop: space.md, gap: 6 },
  sectionTitle: { ...eyebrow, color: colors.textMuted, marginBottom: 2 },
  actionRow: { flexDirection: "row", gap: space.xs, alignItems: "flex-start" },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  actionText: { ...type.body, color: colors.textSecondary, flex: 1, lineHeight: 20 },
  whyLater: {
    marginTop: space.md,
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    ...type.secondary,
    color: colors.textSecondary,
  },
  shopRow: {
    marginTop: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs + 2,
  },
  shopTitle: { ...type.body, fontWeight: "700", color: colors.text },
  shopSub: { ...type.meta, color: colors.textSecondary },
  caveatRow: { flexDirection: "row", gap: space.xs, alignItems: "flex-start" },
  caveat: { ...type.meta, color: colors.textMuted, flex: 1, lineHeight: 17 },
});
