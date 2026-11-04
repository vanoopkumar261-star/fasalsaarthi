import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Line, Path, Rect } from "react-native-svg";

import { getDashboardData, type DashboardData, type FarmWithCrop } from "@/lib/dashboard";
import { getWeather, type WeatherData } from "@/lib/weather";
import {
  computeIrrigationPlan,
  rainfedOutlook,
  type IrrigationPlan,
} from "@/lib/irrigation";
import { useScreenDescriber } from "@/lib/agent/screenRegistry";
import { getPlanState } from "@/lib/plan";
import { atLeast, planOf, type PlanId } from "@/lib/plans";
import { GATES, PlanLocked } from "./PlanLocked";
import { cardShadow, colors, eyebrow, layout, radius, space, tabularNums, type, themed } from "@/theme";
import { useT } from "./i18n/LanguageProvider";
import { EmptyState } from "./ui/EmptyState";
import { SkeletonCard, SkeletonHeader } from "./ui/Skeleton";
import { Reveal } from "./ui/Reveal";

/**
 * Irrigation — what each field needs to drink, when, and why.
 *
 * The website has had this since the FAO-56 engine landed; the app collected
 * the three questions that feed it at registration and then had nowhere to put
 * the answer. This is that answer.
 *
 * The screen is deliberately per-farm rather than one holding-wide number: two
 * plots with the same crop on different soils want water on different days,
 * and that difference is the whole point of modelling it rather than guessing.
 */

const VERDICT_META: Record<
  IrrigationPlan["verdict"],
  { icon: keyof typeof MaterialCommunityIcons.glyphMap; key: string; tone: "primary" | "sage" | "ai" | "neutral" }
> = {
  irrigate_today: { icon: "water", key: "irrigation.verdict.irrigateToday", tone: "primary" },
  hold: { icon: "pause-circle-outline", key: "irrigation.verdict.hold", tone: "sage" },
  rain_coming: { icon: "weather-pouring", key: "irrigation.verdict.rainComing", tone: "ai" },
  no_crop: { icon: "sprout-outline", key: "irrigation.verdict.noCrop", tone: "neutral" },
  no_data: { icon: "cloud-off-outline", key: "irrigation.verdict.noData", tone: "neutral" },
};

const STATUS_KEY: Record<IrrigationPlan["status"], string> = {
  optimal: "irrigation.status.optimal",
  deficit: "irrigation.status.deficit",
  critical: "irrigation.status.critical",
  over_irrigated: "irrigation.status.overIrrigated",
};

/** Status → the band colour that carries it. Resolved to a string, because
    `colors` has one nested member and `keyof typeof colors` is therefore too
    wide to index as a colour. */
function statusColor(status: IrrigationPlan["status"]): string {
  if (status === "optimal") return colors.optimal;
  if (status === "critical") return colors.critical;
  return colors.attention;
}

export function IrrigationScreen() {
  const { t } = useT();
  const [data, setData] = useState<DashboardData | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Null while unknown: showing the lock before the tier has loaded would
  // flash "upgrade" at a farmer who has already paid.
  const [plan, setPlan] = useState<PlanId | null>(null);

  // The weather fetch is the slow part and the farmer can leave mid-flight.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const dash = await getDashboardData();
    if (!alive.current) return;
    setData(dash);
    const lat = dash.farmer?.house_lat;
    const lng = dash.farmer?.house_lng;
    const w = lat != null && lng != null ? await getWeather(lat, lng).catch(() => null) : null;
    if (alive.current) setWeather(w);
    const state = await getPlanState();
    // A tier that cannot be read must not lock the farmer out of something
    // they are paying for, so an unreachable server leaves the screen open.
    if (alive.current) setPlan(state ? planOf(state.plan) : "elite");
  }, []);

  useEffect(() => {
    load().finally(() => {
      if (alive.current) setLoading(false);
    });
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const farms = data?.farms ?? [];
  const plans = farms.map((farm) =>
    computeIrrigationPlan({ farm, crop: farm.crop ?? null, weather })
  );

  useScreenDescriber("/irrigation", () => {
    if (loading) return "";
    if (!plans.length) return "No farms registered yet, so there is nothing to irrigate.";
    return plans
      .map((p) => {
        const what =
          p.verdict === "irrigate_today"
            ? `needs ${p.grossMm} mm today, about ${Math.round(p.volumeLitres).toLocaleString("en-IN")} litres`
            : p.verdict === "rain_coming"
              ? "can wait, rain is expected"
              : p.verdict === "hold"
                ? "needs no water today"
                : "has no plan yet";
        return `Farm ${p.farmIndex}${p.cropName ? ` (${p.cropName})` : ""} ${what}. Soil water is at ${Math.round(p.availablePct)}% of capacity.`;
      })
      .join(" ");
  });

  const gate = GATES.irrigation!;
  if (!loading && plan && !atLeast(plan, gate.requiredPlan)) {
    return (
      <PlanLocked
        currentPlan={plan}
        requiredPlan={gate.requiredPlan}
        titleKey={gate.titleKey}
        bodyKey={gate.bodyKey}
      />
    );
  }

  if (loading) {
    return (
      <ScrollView contentContainerStyle={styles.container} scrollEnabled={false}>
        <SkeletonHeader />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
      </ScrollView>
    );
  }

  if (!farms.length) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <EmptyState
          icon="water-outline"
          title={t("irrigation.board.noFarms")}
          body={t("irrigation.board.noFarmsBody")}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {plans.map((plan, i) => (
        <Reveal key={plan.farmId ?? plan.farmIndex}>
          <PlanCard plan={plan} farm={farms[i]} />
        </Reveal>
      ))}
    </ScrollView>
  );
}

/** Verdict tone → its band colour. A map, so the lookup is typed. */
const TONE_STYLE: Record<"primary" | "sage" | "ai" | "neutral", { backgroundColor: string }> = {
  primary: { backgroundColor: colors.primary },
  sage: { backgroundColor: colors.primaryDeep },
  ai: { backgroundColor: colors.info },
  neutral: { backgroundColor: colors.textMuted },
};

function PlanCard({ plan, farm }: { plan: IrrigationPlan; farm: FarmWithCrop }) {
  const { t } = useT();
  const v = VERDICT_META[plan.verdict];
  const showNumbers = plan.verdict === "irrigate_today" && plan.volumeLitres > 0;
  const outlook = plan.regime === "rainfed" ? rainfedOutlook(plan) : null;

  return (
    <View style={[styles.card, cardShadow]}>
      <View style={styles.cardHead}>
        <Text style={styles.farmName}>
          Farm {plan.farmIndex}
          {plan.cropName ? ` · ${plan.cropName}` : ""}
        </Text>
        <Text style={styles.setup}>
          {plan.irrigationLabel} · {plan.areaAcres} acres
        </Text>
      </View>

      {/* The verdict leads. A farmer who reads nothing else should still know
          whether to turn the pump on today. */}
      <View style={[styles.verdict, TONE_STYLE[v.tone]]}>
        <MaterialCommunityIcons name={v.icon} size={22} color={colors.onPrimary} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.verdictText}>{t(v.key)}</Text>
          {plan.stage ? (
            <Text style={styles.verdictSub}>
              {t("irrigation.verdict.dayStage", { day: plan.stage.day, stage: plan.stage.label })}
            </Text>
          ) : null}
        </View>
      </View>

      <Text style={[styles.status, { color: statusColor(plan.status) }]}>
        {t(STATUS_KEY[plan.status])}
      </Text>

      {showNumbers ? (
        <View style={styles.figures}>
          <Figure
            label={t("irrigation.figure.apply")}
            value={`${plan.grossMm} mm`}
            note={t("irrigation.figure.toRoots", { mm: plan.needMm })}
          />
          <Figure
            label={t("irrigation.figure.thatIs")}
            value={`${Math.round(plan.volumeLitres).toLocaleString("en-IN")} L`}
            note={t("irrigation.figure.overAcres", { acres: plan.areaAcres })}
          />
          <Figure
            label={t("irrigation.figure.runFor")}
            value={plan.runMinutes >= 60 ? `${Math.round((plan.runMinutes / 60) * 10) / 10} h` : `${plan.runMinutes} min`}
            note={
              plan.efficiencyAssumed
                ? t("irrigation.figure.assumedSystem")
                : t("irrigation.figure.efficient", { pct: Math.round(plan.efficiency * 100) })
            }
          />
        </View>
      ) : null}

      <MoistureBar plan={plan} />

      {plan.forecast.length > 1 ? <ForecastChart plan={plan} /> : null}

      {outlook ? (
        <View style={styles.outlook}>
          <Text style={styles.sectionLabel}>{t("irrigation.rainfed.title")}</Text>
          <Text style={styles.outlookText}>
            {outlook.stressDays === 0
              ? t(
                  plan.forecast.some((d) => d.rainMm > 2)
                    ? "irrigation.rainfed.okayRain"
                    : "irrigation.rainfed.okay",
                  { crop: plan.cropName ?? "the crop" }
                )
              : t("irrigation.rainfed.short", {
                  crop: plan.cropName ?? "The crop",
                  days: outlook.stressDays,
                })}
          </Text>
          {outlook.stressDays > 0 && outlook.worstDate ? (
            <Text style={styles.outlookText}>
              {t("irrigation.rainfed.worstDay", {
                worstDay: new Date(outlook.worstDate).toLocaleDateString("en-IN", {
                  weekday: "long",
                }),
              })}
            </Text>
          ) : null}
          {/* Flowering is the one stage where being short of water does
              lasting damage, so it is called out rather than left in the list. */}
          {outlook.stressDays > 0 && plan.stage?.label === "Flowering" ? (
            <Text style={styles.outlookText}>{t("irrigation.rainfed.flowering")}</Text>
          ) : null}
          {outlook.stressDays > 0 ? (
            <Text style={styles.outlookText}>{t("irrigation.rainfed.conserve")}</Text>
          ) : null}
        </View>
      ) : (
        <Schedule plan={plan} />
      )}

      {plan.factors.length ? (
        <View style={styles.factors}>
          {plan.factors.map((f) => (
            <View key={f.label} style={styles.factorRow}>
              <Text style={styles.factorDot}>·</Text>
              <Text style={styles.factorText}>{f.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Provenance, always. Every number above is a standard figure for a
          field with no soil test, and saying so is what separates this from
          a confident guess. */}
      <Text style={styles.provenance}>
        {t("irrigation.board.provenance", { soil: farm.soil_type ?? "this soil" })}
      </Text>
      {plan.efficiencyAssumed ? (
        <Text style={styles.caveat}>{t("irrigation.board.assumedEfficiency")}</Text>
      ) : null}
      <Text style={styles.caveat}>
        {plan.balanceSource === "sensor"
          ? t("irrigation.board.startSensor")
          : plan.balanceSource === "modelled"
            ? t("irrigation.board.startModelled")
            : t("irrigation.board.startAssumed")}
      </Text>
    </View>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{label}</Text>
      <Text style={styles.figureValue}>{value}</Text>
      <Text style={styles.figureNote}>{note}</Text>
    </View>
  );
}

/** Where the root zone's water sits now, against the refill point. */
function MoistureBar({ plan }: { plan: IrrigationPlan }) {
  const { t } = useT();
  const pct = Math.max(0, Math.min(100, plan.availablePct));
  // The trigger is expressed as depletion; the bar shows what remains.
  const triggerPct = plan.taw > 0 ? Math.max(0, 100 - (plan.triggerMm / plan.taw) * 100) : 0;

  return (
    <View style={styles.barBlock}>
      <View style={styles.barHead}>
        <Text style={styles.sectionLabel}>{t("irrigation.board.soilWaterNow")}</Text>
        <Text style={styles.barPct}>{Math.round(pct)}%</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: statusColor(plan.status) }]} />
        {/* The refill line: cross it and the crop starts losing yield. */}
        <View style={[styles.barTrigger, { left: `${triggerPct}%` }]} />
      </View>
      <Text style={styles.barNote}>{t("irrigation.board.ofCapacity", { mm: Math.round(plan.taw) })}</Text>
    </View>
  );
}

/**
 * Seven days of soil water, drawn against the refill line.
 *
 * Hand-drawn in SVG rather than pulled from a charting library: it is one
 * series and one threshold, and the app already ships react-native-svg for the
 * soil pH scale.
 */
function ForecastChart({ plan }: { plan: IrrigationPlan }) {
  const { t } = useT();
  const W = 300;
  const H = 96;
  const days = plan.forecast.slice(0, 7);
  if (days.length < 2 || plan.taw <= 0) return null;

  const x = (i: number) => (i / (days.length - 1)) * W;
  // Depletion grows downward in the data; the chart shows water remaining.
  const y = (depletion: number) => (Math.max(0, Math.min(plan.taw, depletion)) / plan.taw) * H;

  const path = days.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.depletionMm).toFixed(1)}`).join(" ");
  const triggerY = y(plan.triggerMm);

  return (
    <View style={styles.chartBlock}>
      <Text style={styles.sectionLabel}>{t("irrigation.chart.title")}</Text>
      <Svg width="100%" height={H + 18} viewBox={`0 -4 ${W} ${H + 18}`}>
        {/* Rain bars sit behind the line: they are the reason it moves. */}
        {days.map((d, i) =>
          d.rainMm > 0 ? (
            <Rect
              key={`r${i}`}
              x={x(i) - 5}
              y={H - Math.min(H, d.rainMm * 2)}
              width={10}
              height={Math.min(H, d.rainMm * 2)}
              fill={colors.info}
              opacity={0.45}
              rx={2}
            />
          ) : null
        )}
        <Line x1={0} y1={triggerY} x2={W} y2={triggerY} stroke={colors.attention} strokeWidth={1.5} strokeDasharray="5 4" />
        <Path d={path} stroke={colors.primary} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
      </Svg>
      <View style={styles.chartLegend}>
        <Legend color={colors.primary} label={t("irrigation.chart.soilWater")} />
        <Legend color={colors.attention} label={t("irrigation.chart.refillPoint")} />
        <Legend color={colors.info} label={t("irrigation.chart.rain")} />
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function Schedule({ plan }: { plan: IrrigationPlan }) {
  const { t } = useT();
  const entries = plan.schedule.slice(0, 7);

  return (
    <View style={styles.scheduleBlock}>
      <Text style={styles.sectionLabel}>{t("irrigation.schedule.title")}</Text>
      {entries.length === 0 ? (
        <Text style={styles.scheduleEmpty}>
          {t(
            plan.forecast.some((d) => d.rainMm > 2) ? "irrigation.schedule.noneRain" : "irrigation.schedule.none",
            { crop: plan.cropName ?? "the crop" }
          )}
        </Text>
      ) : (
        <>
          <Text style={styles.scheduleCount}>
            {entries.length === 1
              ? t("irrigation.schedule.plannedOne")
              : t("irrigation.schedule.plannedMany", { n: entries.length })}
          </Text>
          {entries.map((e) => (
            <View key={e.dateISO} style={styles.scheduleRow}>
              <Text style={styles.scheduleDay}>{e.weekday}</Text>
              <Text style={styles.scheduleMm}>{e.grossMm} mm</Text>
              <Text style={styles.scheduleRun}>
                {e.runMinutes >= 60 ? `${Math.round((e.runMinutes / 60) * 10) / 10} h` : `${e.runMinutes} min`}
              </Text>
            </View>
          ))}
          <Text style={styles.caveat}>{t("irrigation.schedule.runTimesAssumed")}</Text>
        </>
      )}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  container: { padding: layout.screenX, paddingBottom: space.xl * 2, gap: space.md },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  cardHead: { gap: 2 },
  farmName: { ...type.section, color: colors.text, fontWeight: "800" },
  setup: { ...type.secondary, color: colors.textMuted },

  verdict: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderRadius: radius.card,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
  },
  verdictText: { ...type.body, color: colors.onPrimary, fontWeight: "800" },
  verdictSub: { ...type.meta, color: colors.onPrimary, opacity: 0.85, marginTop: 1 },

  status: { ...type.secondary, fontWeight: "700" },

  figures: { flexDirection: "row", gap: space.sm },
  figure: { flex: 1, minWidth: 0, gap: 1 },
  figureLabel: { ...eyebrow, color: colors.textMuted },
  figureValue: { ...tabularNums, ...type.section, color: colors.text, fontWeight: "800" },
  figureNote: { ...type.meta, color: colors.textMuted },

  barBlock: { gap: 6 },
  barHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  sectionLabel: { ...eyebrow, color: colors.textMuted },
  barPct: { ...tabularNums, ...type.body, color: colors.text, fontWeight: "800" },
  barTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.bgSunken,
    overflow: "hidden",
    justifyContent: "center",
  },
  barFill: { height: 10, borderRadius: 999 },
  barTrigger: { position: "absolute", width: 2, height: 14, backgroundColor: colors.attention },
  barNote: { ...type.meta, color: colors.textMuted },

  chartBlock: { gap: 6 },
  chartLegend: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendSwatch: { width: 10, height: 3, borderRadius: 2 },
  legendText: { ...type.meta, color: colors.textMuted },

  scheduleBlock: { gap: 5 },
  scheduleEmpty: { ...type.secondary, color: colors.textSecondary, lineHeight: 19 },
  scheduleCount: { ...type.secondary, color: colors.text, fontWeight: "700" },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  scheduleDay: { ...type.secondary, color: colors.text, flex: 1 },
  scheduleMm: { ...tabularNums, ...type.secondary, color: colors.text, fontWeight: "700" },
  scheduleRun: { ...tabularNums, ...type.secondary, color: colors.textMuted, width: 70, textAlign: "right" },

  outlook: { gap: 4 },
  outlookText: { ...type.secondary, color: colors.textSecondary, lineHeight: 19 },

  factors: { gap: 3 },
  factorRow: { flexDirection: "row", gap: 6 },
  factorDot: { ...type.secondary, color: colors.textMuted },
  factorText: { flex: 1, ...type.secondary, color: colors.textSecondary, lineHeight: 18 },

  provenance: { ...type.meta, color: colors.textMuted, lineHeight: 16 },
  caveat: { ...type.meta, color: colors.textMuted, lineHeight: 16 },
}));
