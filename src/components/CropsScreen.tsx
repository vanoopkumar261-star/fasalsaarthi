import { useCallback, useEffect, useState } from "react";
import { useT } from "./i18n/LanguageProvider";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getDashboardData, type DashboardData, type FarmWithCrop } from "@/lib/dashboard";
import { getWeather, type WeatherData } from "@/lib/weather";
import { cropStageFor, harvestInfo, STAGE_LABELS, type StageLabel } from "@/lib/agronomy";
import { computeFarmHealth } from "@/lib/health";
import { colors } from "@/constants/colors";
import { cardShadow } from "@/constants/effects";
import { SkeletonHeader, SkeletonCard, SkeletonTile } from "./ui/Skeleton";
import { Reveal } from "./ui/Reveal";
import { HeroCard } from "./ui/HeroCard";
import { AccordionRow } from "./ui/AccordionRow";
import { AddFarmModal } from "./AddFarmModal";
import type { Ionicons } from "@expo/vector-icons";

import { themed } from "@/theme";
import { usePendingIntent } from "@/lib/agent/intents";
import { useScreenDescriber } from "@/lib/agent/screenRegistry";
const STAGE_ICON: Record<StageLabel, React.ComponentProps<typeof Ionicons>["name"]> = {
  Germination: "leaf-outline",
  Seedling: "flower-outline",
  Vegetative: "trending-up-outline",
  Flowering: "sunny-outline",
  Maturity: "checkmark-done-outline",
};

const STAGE_GUIDANCE: Record<StageLabel, string> = {
  Germination: "Seeds absorb moisture and begin to sprout. Keep the soil consistently moist and avoid heavy irrigation that can wash seeds away.",
  Seedling: "Young shoots emerge and first leaves form. Watch for pests and thin out overcrowded seedlings if needed.",
  Vegetative: "Rapid leaf and stem growth. Nutrient and water demand is highest now — stay on top of fertilizing and irrigation.",
  Flowering: "Flowers form ahead of fruit or grain set. Avoid drought or nutrient stress — this stage is critical for final yield.",
  Maturity: "Growth slows as the crop ripens. Ease off irrigation as harvest nears and start planning labor and storage.",
};

export function CropsScreen() {
  const { t } = useT();
  const [data, setData] = useState<DashboardData | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  /*
    "Add a new field" by voice. The add-farm sheet is a modal on this screen,
    not a route, so the navigate tool cannot reach it — the agent lands here
    and leaves the intent for the screen to claim, the same arrangement the
    scan and soil cameras use.
  */
  const voiceAddFarm = usePendingIntent<{ open: boolean }>("addFarm");
  useEffect(() => {
    if (voiceAddFarm?.open) setAddOpen(true);
  }, [voiceAddFarm]);

  const load = useCallback(async () => {
    const dash = await getDashboardData();
    setData(dash);
    if (dash.farmer?.house_lat != null && dash.farmer?.house_lng != null) {
      const w = await getWeather(dash.farmer.house_lat, dash.farmer.house_lng);
      setWeather(w);
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  useScreenDescriber("/crops", () => {
    if (loading) return "";
    const farms = data?.farms ?? [];
    if (!farms.length) return "No farms registered yet.";
    return farms
      .map((f, i) => {
        if (!f.crop) return `Farm ${i + 1}: no crop.`;
        const stage = cropStageFor(f.crop.chosen_crop, f.crop.seeding_date, f.crop.estimated_harvest_date);
        const { daysLeft } = harvestInfo(f.crop.chosen_crop, f.crop.seeding_date, f.crop.estimated_harvest_date);
        return `Farm ${i + 1}: ${f.crop.chosen_crop}, day ${stage.day}, ${stage.label} stage, ${daysLeft > 0 ? `about ${daysLeft} days to harvest` : "ready to harvest"}.`;
      })
      .join(" ") + (weather ? ` Weather now ${weather.current.temp}°C, ${weather.current.label}.` : "");
  });

  if (loading) {
    return (
      <SafeAreaView edges={["left", "right"]} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container} scrollEnabled={false}>
          <SkeletonHeader />
          <View style={styles.statGrid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonTile key={i} />
            ))}
          </View>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const farmer = data?.farmer;
  const farms = data?.farms ?? [];

  if (!farmer) {
    return (
      <SafeAreaView edges={["left", "right"]} style={styles.safe}>
        <View style={styles.container}>
          <Header />
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("crops.empty.title")}</Text>
            <Text style={styles.cardBody}>
              Register a farm and pick crops to see them here.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const withCrop = farms.filter((f) => f.crop);
  const totalArea = farms.reduce((s, f) => s + (f.area || 0), 0);
  const nextHarvestDays = withCrop.length
    ? Math.min(
        ...withCrop.map(
          (f) => harvestInfo(f.crop!.chosen_crop, f.crop!.seeding_date, f.crop!.estimated_harvest_date).daysLeft
        )
      )
    : 0;

  return (
    <Reveal>
      <SafeAreaView edges={["left", "right"]} style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Header />

          <View style={styles.statGrid}>
            <StatTile label="Active Crops" value={String(withCrop.length)} />
            <StatTile label="Total Area" value={`${totalArea} ac`} />
            <StatTile label="Farms" value={String(farms.length)} />
            <StatTile label="Next Harvest" value={withCrop.length ? `${nextHarvestDays} d` : "—"} />
          </View>

          {data?.farmer && (
            <Pressable
              onPress={() => setAddOpen(true)}
              accessibilityRole="button"
              style={styles.addFarm}
            >
              <Text style={styles.addFarmText}>+ {t("addFarmModal.title")}</Text>
            </Pressable>
          )}

          {farms.length === 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t("home.noFarms")}</Text>
              <Text style={styles.cardBody}>{t("crops.empty.body")}</Text>
            </View>
          )}

          {farms.map((farm) => (
            <FarmCard
              key={farm.id}
              farm={farm}
              health={farm.crop ? computeFarmHealth({ farms: [farm], weather }).score : undefined}
            />
          ))}
        </ScrollView>

        {data?.farmer && (
          <AddFarmModal
            visible={addOpen}
            farmerId={data.farmer.id}
            locationAddress={data.farmer.house_address ?? ""}
            onClose={() => setAddOpen(false)}
            onAdded={() => {
              setAddOpen(false);
              void load();
            }}
          />
        )}
      </SafeAreaView>
    </Reveal>
  );
}

function Header() {
  const { t } = useT();
  return (
    <View style={styles.headerRow}>
      <Text style={styles.subtitle}>{t("crops.subtitle")}</Text>
    </View>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function FarmCard({ farm, health }: { farm: FarmWithCrop; health?: number }) {
  const { t } = useT();
  const crop = farm.crop;

  if (!crop) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardLabel}>FARM {farm.farm_index}</Text>
        <Text style={styles.cardTitle}>{t("crops.empty.title")}</Text>
      </View>
    );
  }

  const stage = cropStageFor(crop.chosen_crop, crop.seeding_date, crop.estimated_harvest_date);
  const currentStageIdx = STAGE_LABELS.indexOf(stage.label);
  const { daysLeft, harvestLabel, estimated } = harvestInfo(
    crop.chosen_crop,
    crop.seeding_date,
    crop.estimated_harvest_date
  );
  const score = health ?? Math.max(60, Math.min(96, 78 + Math.round(stage.progress * 12)));

  return (
    <View style={{ gap: 10 }}>
      <HeroCard
        eyebrow={`FARM ${farm.farm_index}`}
        title={crop.chosen_crop}
        meta={`Day ${stage.day} · ${stage.label} stage · ${daysLeft > 0 ? `~${daysLeft}d to harvest` : "Ready to harvest"}`}
        badge={`${score} Health`}
        icon="leaf"
        tone={score >= 80 ? "green" : score >= 60 ? "mustard" : "critical"}
      >
        <View style={styles.chipRowOnHero}>
          <ChipOnHero text={farm.soil_type} />
          <ChipOnHero text={farm.irrigation} />
          <ChipOnHero text={`${farm.area} acres`} />
          <ChipOnHero text={`${estimated ? "Est." : "Planned"} ${harvestLabel}`} />
        </View>
      </HeroCard>

      <View style={{ gap: 8 }}>
        <Text style={styles.timelineLabel}>{t("crops.growthTimeline")}</Text>
        {STAGE_LABELS.map((label, i) => {
          const done = i < currentStageIdx;
          const current = i === currentStageIdx;
          return (
            <AccordionRow
              key={label}
              icon={STAGE_ICON[label]}
              iconTone={current ? "green" : done ? "green" : "muted"}
              title={label}
              subtitle={current ? `Day ${stage.day} of ${stage.cycleDays} · in progress` : done ? "Completed" : "Upcoming"}
              defaultOpen={current}
            >
              <Text style={styles.stageGuidance}>{STAGE_GUIDANCE[label]}</Text>
            </AccordionRow>
          );
        })}
      </View>
    </View>
  );
}

function ChipOnHero({ text }: { text: string }) {
  return (
    <View style={styles.chipOnHero}>
      <Text style={styles.chipOnHeroText}>{text}</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent" },
  container: { padding: 20, gap: 14, paddingBottom: 48 },
  headerRow: { marginBottom: 4, gap: 3 },
  eyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 1, color: colors.leaf },
  greeting: { fontSize: 24, fontWeight: "700", color: colors.ink },
  subtitle: { fontSize: 13, color: colors.textFaint },

  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statTile: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  statValue: { fontSize: 18, fontWeight: "700", color: colors.ink },
  statLabel: { fontSize: 12, fontWeight: "600", color: colors.textFaint, textTransform: "uppercase", letterSpacing: 0.4 },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: 24,
    padding: 18,
    gap: 6,
    ...cardShadow,
  },
  cardLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6, color: colors.leaf },
  cardTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  cardBody: { fontSize: 15, color: colors.textSoft, lineHeight: 20 },
  cardMeta: { fontSize: 13, color: colors.textFaint, marginTop: 2 },

  chipRowOnHero: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chipOnHero: { backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  chipOnHeroText: { fontSize: 12, fontWeight: "600", color: "#FFFFFF" },

  timelineLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6, color: colors.leaf, marginLeft: 2 },
  stageGuidance: { fontSize: 13, color: colors.textSoft, lineHeight: 18 },
  addFarm: {
    marginTop: 4,
    height: 48,
    borderRadius: 999,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  addFarmText: { color: colors.primary, fontSize: 15, fontWeight: "800" },
}));
