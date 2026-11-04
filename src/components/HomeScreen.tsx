import { useCallback, useEffect, useState } from "react";
import { colors as tokens, themed } from "@/theme";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getDashboardData, type DashboardData, type FarmWithCrop } from "@/lib/dashboard";
import { getWeather, type WeatherData } from "@/lib/weather";
import { computeFarmHealth, type FarmHealth } from "@/lib/health";
import { collectHealthSignals } from "@/lib/healthSignals";
import { generateTasks, type TaskSeed } from "@/lib/agronomy";
import { recordDayTasks, loadDoneKeys, persistTaskDone, tallyDayTasks, yesterdayKey } from "@/lib/tasks";
import { deriveAlerts, type Alert } from "@/lib/alerts";
import { syncNotifications } from "@/lib/notifications";
import { useScreenAction, useScreenDescriber } from "@/lib/agent/screenRegistry";
import { colors } from "@/constants/colors";
import { cardShadow, insightShadow } from "@/constants/effects";
import { useT } from "./i18n/LanguageProvider";
import { SensorCard } from "./SensorCard";
import { AddFarmModal } from "./AddFarmModal";
import { CallMeCard } from "./CallMeCard";
import HazardCheckModal from "./HazardCheckModal";
import { FreshnessBadge } from "./ui/FreshnessBadge";
import { SkeletonHeader, SkeletonCard } from "./ui/Skeleton";
import { Reveal } from "./ui/Reveal";
import { HeroCard } from "./ui/HeroCard";

const rupee = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;

function minsAgo(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return "just now";
  if (m === 1) return "1 min ago";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} hr${h > 1 ? "s" : ""} ago`;
}

type T = (key: string, params?: Record<string, string | number>) => string;

function greeting(t: T): string {
  const h = new Date().getHours();
  if (h < 12) return t("greeting.morning");
  if (h < 17) return t("greeting.afternoon");
  return t("greeting.evening");
}

function farmContext(farms: FarmWithCrop[], t: T): string {
  if (farms.length === 0) return t("home.noFarms");
  if (farms.length === 1) {
    const f = farms[0];
    return t("home.farmOne", {
      crop: f.crop ? f.crop.chosen_crop : t("home.noCrop"),
      area: f.area,
    });
  }
  const crops = Array.from(new Set(farms.map((f) => f.crop?.chosen_crop).filter(Boolean)));
  return t("home.farmsMany", { n: farms.length, crops: crops.join(", ") || t("home.noCrop") });
}

const ALERT_TONE: Record<Alert["kind"], { bg: string; border: string; icon: keyof typeof Ionicons.glyphMap }> = themed(() => ({
  critical: { bg: colors.dangerBg, border: colors.danger, icon: "warning-outline" },
  weather: { bg: colors.sage, border: colors.primary, icon: "rainy-outline" },
  disease: { bg: tokens.accentSoft, border: colors.attention, icon: "bug-outline" },
  ai: { bg: colors.sage, border: colors.primary, icon: "sparkles-outline" },
  task: { bg: tokens.accentSoft, border: colors.attention, icon: "list-outline" },
}));

const TASK_TONE: Record<TaskSeed["tone"], string> = themed(() => ({
  green: colors.primary,
  amber: colors.amberInk,
  blue: tokens.info,
}));

/** Destination keys the quick actions and preview cards can ask for. The route
 *  layer maps them onto real paths; this screen no longer knows about tabs. */
export type HomeDestination =
  | "scan" | "assistant" | "crops" | "settings";

export function HomeScreen({ onNavigate }: { onNavigate?: (dest: HomeDestination) => void }) {
  const { t } = useT();
  const [data, setData] = useState<DashboardData | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherAt, setWeatherAt] = useState<number | null>(null);
  const [health, setHealth] = useState<FarmHealth | null>(null);
  const [tasks, setTasks] = useState<TaskSeed[]>([]);
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set());
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [hazardOpen, setHazardOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showWhyHealth, setShowWhyHealth] = useState(false);
  const [addFarmOpen, setAddFarmOpen] = useState(false);

  const load = useCallback(async () => {
    const dash = await getDashboardData();
    setData(dash);
    const farmer = dash.farmer;

    let w: WeatherData | null = null;
    if (farmer?.house_lat != null && farmer?.house_lng != null) {
      w = await getWeather(farmer.house_lat, farmer.house_lng);
    }
    setWeather(w);
    setWeatherAt(Date.now());

    const yesterdayTally = farmer ? await tallyDayTasks(farmer.id, yesterdayKey()) : { total: 0, done: 0, missed: 0 };

    // The six measured conditions need readings. Each one is optional and
    // each is allowed to fail: the score renormalises over whatever reported.
    const signals = await collectHealthSignals({
      farmerId: farmer?.id ?? null,
      farms: dash.farms,
      weather: w,
    });
    setHealth(
      computeFarmHealth({
        farms: dash.farms,
        weather: w,
        overdueTasks: yesterdayTally.missed,
        signals,
      })
    );
    const derived = deriveAlerts({ farms: dash.farms, weather: w, missedYesterday: yesterdayTally });
    setAlerts(derived);

    const seeds = generateTasks(dash.farms, w);
    setTasks(seeds);
    if (farmer) {
      await recordDayTasks(farmer.id, seeds);
      setDoneKeys(await loadDoneKeys(farmer.id));

      // Record today's alerts and tasks so the Alerts screen has a history.
      // The website writes the same rows from its dashboard render; the dedupe
      // keys match its format exactly, because both clients write into one
      // table for one farmer and a different key would duplicate every row for
      // anyone who uses both. Fire-and-forget: a farmer waiting for their home
      // screen must not wait on a write they never asked for.
      const today = new Date().toISOString().slice(0, 10);
      void syncNotifications(farmer.id, [
        ...derived.map((a) => ({
          dedupeKey: `alert:${today}:${a.title}`,
          kind: a.kind,
          title: a.title,
          body: a.body,
        })),
        ...seeds.slice(0, 3).map((tk) => ({
          dedupeKey: `task:${today}:${tk.key ?? tk.title}`,
          kind: "task",
          title: tk.title,
          body: tk.meta,
        })),
      ]);
    } else {
      setDoneKeys(new Set());
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

  function toggleTask(t: TaskSeed) {
    const isDone = doneKeys.has(t.key);
    const next = new Set(doneKeys);
    if (isDone) next.delete(t.key);
    else next.add(t.key);
    setDoneKeys(next);
    if (data?.farmer) persistTaskDone(data.farmer.id, t, !isDone);
  }

  useScreenDescriber("/today", () => {
    if (loading) return "";
    const w = weather
      ? `Weather: ${weather.current.temp}°C, ${weather.current.label}, ${weather.daily[0]?.precipProb ?? 0}% chance of rain today.`
      : "Weather unavailable.";
    const list = tasks.map((x, i) => `${i + 1}. ${x.title}${doneKeys.has(x.key) ? " (done)" : ""}`).join("; ");
    return [
      w,
      tasks.length ? `Today's tasks: ${list}.` : "No tasks today.",
      alerts.length ? `Alerts: ${alerts.map((a) => a.title).join("; ")}.` : "No alerts.",
    ].join(" ");
  });

  useScreenAction("mark_task_done", async (args) => {
    const task = tasks[Number(args.task_number) - 1];
    if (!task) return null;
    if (!doneKeys.has(task.key)) toggleTask(task);
    return task.title;
  });

  if (loading) {
    return (
      <SafeAreaView edges={["left", "right"]} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container} scrollEnabled={false}>
          <SkeletonHeader />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={1} />
          <SkeletonCard lines={4} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const farmer = data?.farmer;
  const farms = data?.farms ?? [];
  const doneCount = tasks.filter((t) => doneKeys.has(t.key)).length;

  return (
    <Reveal>
      <SafeAreaView edges={["left", "right"]} style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>
                {greeting(t)}
                {farmer ? `, ${farmer.name.split(" ")[0]}` : ""}
              </Text>
              <Text style={styles.farmContext}>{farmContext(farms, t)}</Text>
            </View>
          </View>

          {!farmer && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t("home.noProfileTitle")}</Text>
              <Text style={styles.cardBody}>{t("home.noProfileBody")}</Text>
            </View>
          )}

          {/* The alerts below are our own reading of the forecast. This checks
              what IMD / CWC / the state SDMA have actually warned about, on
              demand — kept outside the `alerts.length > 0` block so it is
              reachable even on a quiet day, which is exactly when a farmer wants
              to confirm nothing is coming. */}
          <Pressable style={styles.hazardButton} onPress={() => setHazardOpen(true)}>
            <Ionicons name="shield-half" size={16} color={colors.danger} />
            <Text style={styles.hazardButtonText}>{t("hazardCheck.button")}</Text>
          </Pressable>

          {hazardOpen && <HazardCheckModal onClose={() => setHazardOpen(false)} />}

          {alerts.length > 0 && (
            <View style={{ gap: 8 }}>
              {alerts.map((a, i) => {
                const tone = ALERT_TONE[a.kind];
                return (
                  <View
                    key={i}
                    style={[
                      styles.alertRow,
                      { backgroundColor: tone.bg, borderColor: tone.border + "55" },
                      a.kind === "ai" && insightShadow,
                    ]}
                  >
                    <Ionicons name={tone.icon} size={16} color={tone.border} style={{ marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertTitle}>{a.title}</Text>
                      <Text style={styles.alertBody}>{a.body}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {health && farms.length > 0 && (
            <HeroCard
              eyebrow="FARM HEALTH"
              title={`${health.score} / 100`}
              meta={health.note}
              badge={health.band === "good" ? "Good" : health.band === "watch" ? "Watch" : "Risk"}
              icon="pulse-outline"
              tone={health.band === "good" ? "green" : health.band === "watch" ? "mustard" : "critical"}
              progressPct={health.score}
            >
              <Pressable onPress={() => setShowWhyHealth((v) => !v)} style={{ marginTop: 8 }}>
                <Text style={styles.whyLinkOnHero}>{showWhyHealth ? t("home.hideDetails") : t("home.why")}</Text>
              </Pressable>
              {showWhyHealth && (
                <View style={styles.whyBoxOnHero}>
                  {health.factors.map((f, i) => (
                    <Text key={i} style={styles.whyLineOnHero}>
                      • {f.label}
                      {f.delta !== 0 ? ` (${f.delta})` : ""}
                    </Text>
                  ))}
                </View>
              )}
            </HeroCard>
          )}

          {tasks.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardLabel}>{t("home.todayTasks")}</Text>
                <Text style={styles.cardMeta}>
                  {doneCount} of {tasks.length} done
                </Text>
              </View>
              <View style={{ gap: 2 }}>
                {tasks.map((t) => {
                  const done = doneKeys.has(t.key);
                  return (
                    <Pressable key={t.key} onPress={() => toggleTask(t)} style={styles.taskRow}>
                      <Ionicons
                        name={done ? "checkmark-circle" : "ellipse-outline"}
                        size={22}
                        color={done ? TASK_TONE[t.tone] : colors.sageLine}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.taskTitle, done && styles.taskTitleDone]}>{t.title}</Text>
                        <Text style={styles.taskMeta}>{t.meta}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {weather ? (
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <FreshnessBadge label={`LIVE · ${weatherAt ? minsAgo(weatherAt) : ""}`} tone="live" />
              </View>
              <View style={styles.weatherRow}>
                <Text style={styles.weatherIcon}>{weather.current.icon}</Text>
                <View>
                  <Text style={styles.weatherTemp}>{weather.current.temp}°C</Text>
                  <Text style={styles.weatherLabel}>{weather.current.label}</Text>
                </View>
              </View>
              <Text style={styles.cardBody}>
                {weather.daily[0]?.precipProb ?? 0}% chance of rain · feels like {weather.current.apparent}°C
              </Text>

              {/* The seven days were already being fetched and parsed by
                  lib/weather.ts and then thrown away — only today's rain chance
                  ever reached the screen. A farmer deciding when to irrigate or
                  spray needs the week, not the hour. Rain chance is shown only
                  at 30% or more, so the row does not read as "rain every day". */}
              {weather.daily.length > 1 && (
                <View style={styles.forecastRow}>
                  {weather.daily.slice(0, 7).map((d, i) => (
                    <View key={d.dateISO} style={[styles.forecastDay, i === 0 && styles.forecastToday]}>
                      <Text style={styles.forecastWeekday}>
                        {i === 0 ? t("weatherCard.today") : d.weekday}
                      </Text>
                      <Text style={styles.forecastIcon}>{d.icon}</Text>
                      <Text style={styles.forecastMax}>{d.tMax}°</Text>
                      <Text style={styles.forecastMin}>{d.tMin}°</Text>
                      <Text style={styles.forecastRain}>
                        {d.precipProb >= 30 ? `${d.precipProb}%` : " "}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            // Previously this branch did not exist: a failed fetch made the whole
            // weather card disappear, so a farmer could not tell "no weather
            // today" from "the app is broken". SensorCard already handles its own
            // failure this way; weather was the outlier.
            !loading && (
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <FreshnessBadge label="OFFLINE" tone="offline" />
                </View>
                <Text style={styles.cardBody}>{t("weather.loadFailed")}</Text>
              </View>
            )
          )}

          <SensorCard />

          {onNavigate && (
            <View style={styles.quickActions}>
              <QuickAction icon="camera-outline" label={t("hub.scan")} onPress={() => onNavigate("scan")} />
              <QuickAction icon="chatbubble-ellipses-outline" label={t("nav.assistant")} onPress={() => onNavigate("assistant")} />
              <QuickAction icon="leaf-outline" label={t("nav.crops")} onPress={() => onNavigate("crops")} />
              <QuickAction icon="settings-outline" label={t("nav.settings")} onPress={() => onNavigate("settings")} />
            </View>
          )}

          <CallMeCard />

          {farmer && farms.length === 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t("home.noFarms")}</Text>
              <Text style={styles.cardBody}>{t("home.addFarmBody")}</Text>
              <Pressable
                onPress={() => setAddFarmOpen(true)}
                accessibilityRole="button"
                style={styles.addFarmCta}
              >
                <Ionicons name="add" size={18} color={colors.surface} />
                <Text style={styles.addFarmCtaText}>{t("addFarmModal.title")}</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>

        {farmer && (
          <AddFarmModal
            visible={addFarmOpen}
            farmerId={farmer.id}
            locationAddress={farmer.house_address ?? ""}
            onClose={() => setAddFarmOpen(false)}
            onAdded={() => {
              setAddFarmOpen(false);
              void load();
            }}
          />
        )}
      </SafeAreaView>
    </Reveal>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.quickAction}>
      <View style={styles.quickActionIcon}>
        <Ionicons name={icon} size={19} color={colors.primary} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  addFarmCta: {
    marginTop: 14,
    height: 46,
    borderRadius: 999,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  addFarmCtaText: { color: colors.surface, fontSize: 15, fontWeight: "800" },
  forecastRow: {
    flexDirection: "row",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.sageLine,
    gap: 2,
  },
  forecastDay: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 6, borderRadius: 10 },
  forecastToday: { backgroundColor: colors.sage },
  forecastWeekday: { fontSize: 9.5, fontWeight: "700", color: colors.textFaint, textTransform: "uppercase" },
  forecastIcon: { fontSize: 15 },
  forecastMax: { fontSize: 11.5, fontWeight: "700", color: colors.ink },
  forecastMin: { fontSize: 10, color: colors.textFaint },
  forecastRain: { fontSize: 9, fontWeight: "700", color: colors.primary, minHeight: 12 },
  safe: { flex: 1, backgroundColor: "transparent" },
  container: { padding: 20, gap: 14, paddingBottom: 48 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 },
  greeting: { fontSize: 18, fontWeight: "700", color: colors.ink },
  farmContext: { fontSize: 13, color: colors.textFaint, marginTop: 2, fontWeight: "600" },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: 24,
    padding: 18,
    gap: 8,
    ...cardShadow,
  },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6, color: colors.leaf },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.ink },
  cardBody: { fontSize: 13, color: colors.textSoft, lineHeight: 19 },
  cardMeta: { fontSize: 12, color: colors.textFaint },

  weatherRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  weatherIcon: { fontSize: 28 },
  weatherTemp: { fontSize: 24, fontWeight: "700", color: colors.ink },
  weatherLabel: { fontSize: 13, color: colors.textFaint },

  hazardButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: tokens.severityRedBorder,
    backgroundColor: colors.dangerBg,
    borderRadius: 16,
    paddingVertical: 12,
  },
  hazardButtonText: { fontSize: 13, fontWeight: "700", color: colors.danger },
  alertRow: { flexDirection: "row", gap: 10, borderWidth: 1, borderRadius: 16, padding: 12 },
  alertTitle: { fontSize: 13, fontWeight: "700", color: colors.ink },
  alertBody: { fontSize: 12, color: colors.textSoft, marginTop: 2, lineHeight: 17 },

  whyLink: { fontSize: 12, fontWeight: "700", color: colors.primary, marginTop: 2 },
  whyLinkOnHero: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
  whyBoxOnHero: { gap: 4, marginTop: 8, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 16, padding: 10 },
  whyLineOnHero: { fontSize: 12, color: "rgba(255,255,255,0.9)", lineHeight: 18 },

  taskRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 8 },
  taskTitle: { fontSize: 13, fontWeight: "600", color: colors.ink },
  taskTitleDone: { color: colors.textFaint, textDecorationLine: "line-through" },
  taskMeta: { fontSize: 12, color: colors.textFaint, marginTop: 1 },

  newsRow: { gap: 2 },
  newsTitle: { fontSize: 13, fontWeight: "600", color: colors.ink, lineHeight: 19 },
  newsMeta: { fontSize: 12, color: colors.textFaint },
  quickActions: { flexDirection: "row", gap: 10 },
  quickAction: { flex: 1, alignItems: "center", gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.sageLine, borderRadius: 24, paddingVertical: 14 },
  quickActionIcon: { width: 38, height: 38, borderRadius: 16, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" },
  quickActionLabel: { fontSize: 12, fontWeight: "700", color: colors.ink },

  marketRow: { flexDirection: "row", justifyContent: "space-between" },
  marketName: { fontSize: 13, fontWeight: "600", color: colors.ink },
  marketPrice: { fontSize: 13, fontWeight: "700", color: colors.primary },
  marketDown: { color: colors.danger },
}));
