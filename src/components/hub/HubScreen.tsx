import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInRight,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable } from "@/components/ui/Pressable";
import { getDashboardData } from "../../lib/dashboard";
import { computeFarmHealth } from "../../lib/health";
import { collectHealthSignals } from "../../lib/healthSignals";
import { speak } from "../../lib/speech";
import { guide } from "../../lib/voiceGuide";
import { useScreenDescriber } from "../../lib/agent/screenRegistry";
import { phaseColor, useVoiceAgent } from "../agent/VoiceAgent";
import { getWeather, type WeatherData } from "../../lib/weather";
import { bodyFont, colors, displayFont, eyebrow, themed, useReducedMotion } from "../../theme";
import { useTheme } from "../../theme/ThemeProvider";
import { useT } from "../i18n/LanguageProvider";
import { HubTour } from "../tour/HubTour";
import { setTourScroller, setTourTarget } from "../tour/tourTargets";
import { shouldRunTour } from "../../lib/tour";
import { panelColor, ValleyHeader } from "./ValleyHeader";

type Icon = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
type TileColor = "tileTeal" | "tileGreen" | "tileGold" | "tileCoral" | "tileSky";
type Tile = { key: string; route: string; emoji: string; tKey: string; color: TileColor };

/** The farm-assistance screens opened daily: big tiles on the band. */
const TILES: Tile[] = [
  { key: "scan", route: "/(app)/scan", emoji: "📸", tKey: "hub.scan", color: "tileTeal" },
  { key: "crops", route: "/(app)/crops", emoji: "🌾", tKey: "nav.crops", color: "tileGold" },
  { key: "soil", route: "/(app)/soil", emoji: "🧪", tKey: "hub.soil", color: "tileSky" },
  { key: "today", route: "/(app)/today", emoji: "📅", tKey: "hub.today", color: "tileTeal" },
];

/** Opened now and then: a row of small tiles further down. */
const MORE: Tile[] = [
  { key: "irrigation", route: "/(app)/irrigation", emoji: "💧", tKey: "hub.irrigation", color: "tileSky" },
  { key: "language", route: "/(app)/language", emoji: "🗣️", tKey: "hub.language", color: "tileTeal" },
];

const GUTTER = 20;
let greeted = false;
const TAB_BAR = 64;

function greetingKey(h: number) {
  if (h < 12) return "home.morning";
  if (h < 17) return "home.afternoon";
  return "home.evening";
}

/**
 * Home: an illustrated valley with the greeting over the sky, then a teal band
 * holding today's cards and the six daily tiles, a light sheet with the
 * occasional five, and a bottom bar whose raised centre button is the voice
 * assistant. Everything the old dial reached is still one tap away.
 */
export function HubScreen() {
  const router = useRouter();
  const { t, locale } = useT();
  const { scheme } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const still = useReducedMotion();

  const [health, setHealth] = useState<{ score: number; band: string } | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [name, setName] = useState<string>("");
  const [tourFor, setTourFor] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const dash = await getDashboardData();
        if (alive) setName(dash.farmer?.name?.split(" ")[0] ?? "");
        // First run only. shouldRunTour treats skipping as completing, so
        // someone who dismissed it is not asked again tomorrow.
        if (alive && dash.farmer && shouldRunTour(dash.farmer.preferences)) setTourFor(dash.farmer.id);
        const { house_lat: lat, house_lng: lng } = dash.farmer ?? {};
        const w = lat != null && lng != null ? await getWeather(lat, lng).catch(() => null) : null;
        if (!alive) return;
        setWeather(w);
        const signals = await collectHealthSignals({
          farmerId: dash.farmer?.id ?? null,
          farms: dash.farms,
          weather: w,
        });
        if (!alive) return;
        const h = computeFarmHealth({ farms: dash.farms, weather: w, signals });
        setHealth({ score: Math.round(h.score), band: h.band });
      } catch {
        // Home is navigation first: if the farm's status can't load, every
        // destination below must still work.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useScreenDescriber("/hub", () =>
    "Home menu. The farmer can open: today's tasks and weather, crop scan, my crops, soil, irrigation, alerts and settings, just by asking."
  );

  // Talking app: greet once per session with how to use the screen.
  // Waits a beat so the name has usually loaded; a later name just restarts the wait.
  useEffect(() => {
    if (greeted) return;
    const id = setTimeout(() => {
      greeted = true;
      guide(`${t(greetingKey(new Date().getHours()))}${name ? ", " + name : ""}. ${t("home.tapHint")}`, locale);
    }, 1500);
    return () => clearTimeout(id);
  }, [locale, name, t]);

  const say = useCallback(
    (text: string) => {
      speak(text, locale);
    },
    [locale],
  );
  const bandWord = health ? t(`home.${health.band}`) : "";

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  /**
   * Hands the tour exact rects.
   *
   * The old ring hub computed every node position in JS, so it could publish
   * the arcs without measuring. This screen is ordinary flow layout, so each
   * target is measured instead — measureInWindow, because the tour draws in a
   * Modal over the whole window and a container-relative rect would be offset
   * by the header.
   *
   * Measured at scroll 0, which is where a first run always begins. A target
   * that fails to measure publishes nothing and its step is dropped, which is
   * the same mechanism the web uses to skip its sidebar step on a narrow
   * screen.
   */
  const cardsRef = useRef<View>(null);
  const tilesRef = useRef<View>(null);
  const moreRef = useRef<View>(null);
  const bellRef = useRef<View>(null);

  const publishTargets = useCallback(() => {
    const publish = (id: string, ref: React.RefObject<View | null>) =>
      ref.current?.measureInWindow((x, y, width, height) =>
        setTourTarget(id, { x, y, width, height })
      );
    publish("todayCards", cardsRef);
    publish("tiles", tilesRef);
    publish("more", moreRef);
    publish("bell", bellRef);
  }, []);

  /**
   * How the tour reaches a target that is not on screen.
   *
   * The "More" sheet is always below the fold on a phone, and publishing its
   * rect was not enough: a rect measured at y=2600 on a 2340px screen is
   * reported but not visible, and the tour dimmed the screen around a hole
   * nobody could see. So the screen that owns the scroll offset is the one
   * that offers to fix it — scroll the target up under the greeting, let the
   * animation settle, then re-measure, because the rect published before the
   * scroll is the wrong one.
   *
   * `mic` is deliberately absent: it lives in the fixed tab bar and is always
   * visible, so there is nothing to scroll.
   */
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const refs: Record<string, React.RefObject<View | null>> = {
      todayCards: cardsRef,
      tiles: tilesRef,
      more: moreRef,
      bell: bellRef,
    };

    const measure = (v: View) =>
      new Promise<{ y: number; height: number }>((resolve) =>
        v.measureInWindow((_x, y, _w, h) => resolve({ y, height: h }))
      );

    setTourScroller(async (id) => {
      const node = refs[id]?.current;
      if (!node || !scrollRef.current) return;
      const top = insets.top + 8;
      const bottom = height - TAB_BAR - insets.bottom - 8;
      const rect = await measure(node);
      if (rect.y >= top && rect.y + rect.height <= bottom) return; // already visible
      scrollRef.current.scrollTo({ y: Math.max(0, scrollY.value + rect.y - top), animated: true });
      await new Promise((r) => setTimeout(r, 420)); // let the scroll land
      publishTargets();
      await new Promise((r) => setTimeout(r, 60)); // and the measurements arrive
    });

    return () => setTourScroller(null);
  }, [height, insets.top, insets.bottom, publishTargets, scrollY]);

  const go = useCallback((route: string) => router.push(route as never), [router]);
  const headerH = Math.round(height * 0.44);
  const panel = panelColor(scheme);
  const serif = displayFont(locale);
  const label = bodyFont(locale, "semi");
  const cardW = Math.min(320, width * 0.8);
  const tileW = (width - GUTTER * 2 - 14) / 2;
  const date = new Date();
  const dateText = date.toLocaleDateString(locale === "en" ? "en-IN" : `${locale}-IN`, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <View style={[styles.root, { backgroundColor: panel }]}>
      <View style={StyleSheet.absoluteFill}>
        <ValleyHeader width={width} height={headerH} scheme={scheme} scrollY={scrollY} still={still} />
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR + insets.bottom + 28 }}
      >
        {/* Greeting, over the sky. */}
        <Animated.View entering={FadeIn.duration(600)} style={[styles.top, { height: headerH - 34, paddingTop: insets.top + 14 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[eyebrow, styles.hello, { fontFamily: label }]}>{t(greetingKey(date.getHours()))}</Text>
            <Text style={[styles.name, { fontFamily: serif }]} numberOfLines={1}>
              {name || t("home.farmer")}
            </Text>
          </View>
          <View ref={bellRef} onLayout={publishTargets} collapsable={false}>
            <Pressable
              onPress={() => go("/(app)/alerts")}
              accessibilityRole="button"
              accessibilityLabel={t("hub.alerts")}
              style={styles.glassBtn}
            >
              <MaterialCommunityIcons name="bell-outline" size={22} color={colors.text} />
            </Pressable>
          </View>
        </Animated.View>

        {/* The band: today's cards and the daily tiles. */}
        <View style={[styles.band, { backgroundColor: panel }]}>
          <Text style={[eyebrow, styles.date, { fontFamily: label }]}>{dateText}</Text>
          <Text style={[styles.bandTitle, { fontFamily: serif }]}>{t("home.today")}</Text>

          {/* The negative margin lives on this wrapper, not on the ScrollView
              inside it: the carousel is meant to bleed past the band's gutter,
              and a child overflowing its parent is the one thing Android will
              clip. The wrapper is also the rect the tutorial highlights. */}
          <View
            ref={cardsRef}
            onLayout={publishTargets}
            collapsable={false}
            style={{ marginHorizontal: -GUTTER, marginTop: 14 }}
          >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardW + 14}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}
          >
            <TodayCard
              index={0}
              width={cardW}
              icon="heart-pulse"
              title={t("hub.health")}
              value={health ? `${health.score}` : "—"}
              unit="/100"
              body={bandWord || t("home.healthBody")}
              blob={health?.band === "risk" ? colors.tileCoral : health?.band === "watch" ? colors.tileGold : colors.tileGreen}
              emoji={health?.band === "risk" ? "😟" : health?.band === "watch" ? "😐" : "😊"}
              onSpeak={() => say(health ? `${t("hub.health")} ${health.score} ${t("home.outOf")}. ${bandWord}` : t("hub.health"))}
              onPress={() => go("/(app)/today")}
              serif={serif}
            />
            <TodayCard
              index={1}
              width={cardW}
              icon="weather-partly-cloudy"
              title={t("home.weather")}
              value={weather ? `${Math.round(weather.current.temp)}°` : "—"}
              body={weather ? weather.current.label : ""}
              blob={colors.tileSky}
              emoji={weather?.current.icon ?? "🌤️"}
              onSpeak={() =>
                say(weather ? `${t("home.weather")}. ${Math.round(weather.current.temp)} °C. ${weather.current.label}` : t("home.weather"))
              }
              onPress={() => go("/(app)/today")}
              serif={serif}
            />
            <TodayCard
              index={2}
              width={cardW}
              icon="alert-outline"
              title={t("home.alerts")}
              body={t("home.alertsBody")}
              blob={colors.tileGold}
              emoji="⚠️"
              onSpeak={() => say(`${t("home.alerts")}. ${t("home.alertsBody")}`)}
              onPress={() => go("/(app)/alerts")}
              serif={serif}
            />
          </ScrollView>
          </View>

          <View ref={tilesRef} onLayout={publishTargets} collapsable={false} style={styles.grid}>
            {TILES.map((tile, i) => {
              const text = t(tile.tKey);
              return (
                <Animated.View key={tile.key} entering={FadeInDown.delay(180 + i * 70).springify().damping(16)} style={{ width: tileW }}>
                  <Pressable
                    onPress={() => go(tile.route)}
                    onLongPress={() => speak(text, locale)}
                    accessibilityRole="button"
                    accessibilityLabel={text}
                    android_ripple={{ color: "rgba(255,255,255,0.25)", foreground: true }}
                    style={[styles.tile, { backgroundColor: colors[tile.color] }]}
                  >
                    <View style={styles.tileBlobA} />
                    <View style={styles.tileBlobB} />
                    <SpeakBadge onPress={() => say(text)} label={text} />
                    <View style={styles.iconBox}>
                      <Text style={styles.tileEmoji}>{tile.emoji}</Text>
                    </View>
                    <Text style={[styles.tileLabel, { fontFamily: serif }]} numberOfLines={2}>
                      {text}
                    </Text>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </View>

        {/* The sheet: the occasional five. */}
        <View ref={moreRef} onLayout={publishTargets} collapsable={false} style={styles.sheet}>
          <Text style={[styles.sheetTitle, { fontFamily: serif }]}>{t("home.more")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}
            style={{ marginHorizontal: -GUTTER, marginTop: 14 }}
          >
            {MORE.map((m, i) => {
              const text = t(m.tKey);
              return (
                <Animated.View key={m.key} entering={FadeInRight.delay(300 + i * 60)} style={styles.moreItem}>
                  <Pressable
                    onPress={() => go(m.route)}
                    onLongPress={() => speak(text, locale)}
                    accessibilityRole="button"
                    accessibilityLabel={text}
                    android_ripple={{ color: "rgba(255,255,255,0.25)", foreground: true }}
                    style={[styles.moreTile, { backgroundColor: colors[m.color] }]}
                  >
                    <View style={styles.moreBlob} />
                    <SpeakBadge onPress={() => say(text)} label={text} small />
                    <Text style={styles.moreEmoji}>{m.emoji}</Text>
                  </Pressable>
                  <Text style={[styles.moreLabel, { fontFamily: label }]} numberOfLines={2}>
                    {text}
                  </Text>
                </Animated.View>
              );
            })}
          </ScrollView>
        </View>
      </Animated.ScrollView>

      <TabBar onGo={go} t={t} bottom={insets.bottom} labelFont={label} />

      {tourFor && <HubTour farmerId={tourFor} onClose={() => setTourFor(null)} />}
    </View>
  );
}

function TodayCard({
  index,
  width,
  icon,
  title,
  value,
  unit,
  body,
  blob,
  emoji,
  onSpeak,
  onPress,
  serif,
}: {
  index: number;
  width: number;
  icon: Icon;
  title: string;
  value?: string;
  unit?: string;
  body: string;
  blob: string;
  emoji: string;
  onSpeak: () => void;
  onPress: () => void;
  serif?: string;
}) {
  return (
    <Animated.View entering={FadeInRight.delay(120 + index * 90).springify().damping(18)}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title} ${value ?? ""}`} style={[styles.card, { width }]}>
        <View style={[styles.cardBlob, { backgroundColor: blob }]}>
          <Text style={styles.cardEmoji}>{emoji}</Text>
        </View>
        <View style={styles.cardHead}>
          <View style={[styles.cardDot, { backgroundColor: blob + "33" }]}>
            <MaterialCommunityIcons name={icon} size={15} color={blob} />
          </View>
          <Text style={[styles.cardTitle, { fontFamily: serif }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {value ? (
          <Text style={[styles.cardValue, { fontFamily: serif }]}>
            {value}
            {unit ? <Text style={styles.cardUnit}>{unit}</Text> : null}
          </Text>
        ) : null}
        <Text style={styles.cardBody} numberOfLines={value ? 2 : 3}>
          {body}
        </Text>
        <View style={styles.cardFoot}>
          <Pressable onPress={onSpeak} accessibilityRole="button" accessibilityLabel={title} hitSlop={8} style={styles.cardSpeak}>
            <MaterialCommunityIcons name="volume-high" size={20} color={colors.primary} />
          </Pressable>
          <View style={[styles.cardGo, { backgroundColor: blob }]}>
            <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** A round speaker on a tile: hear what it is without opening it. */
function SpeakBadge({ onPress, label, small }: { onPress: () => void; label: string; small?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={[styles.speak, small && styles.speakSmall]}
    >
      <MaterialCommunityIcons name="volume-high" size={small ? 15 : 18} color="#FFFFFF" />
    </Pressable>
  );
}

/** Slow ripple behind the mic, so the "talk" button is the obvious thing to press.
 *  Tinted to match the mic's current state (green idle / yellow listening / blue busy). */
function Pulse({ color }: { color?: string }) {
  const still = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (!still) p.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1);
  }, [still, p]);
  const style = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - p.value), transform: [{ scale: 1 + p.value * 0.7 }] }));
  return <Animated.View pointerEvents="none" style={[styles.pulse, color ? { backgroundColor: color } : null, style]} />;
}

function TabBar({
  onGo,
  t,
  bottom,
  labelFont,
}: {
  onGo: (r: string) => void;
  t: (k: string) => string;
  bottom: number;
  labelFont?: string;
}) {
  const voice = useVoiceAgent();
  const micRef = useRef<View>(null);
  const item = (icon: Icon, text: string, route: string | null, active = false) => (
    <Pressable
      onPress={() => route && onGo(route)}
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ selected: active }}
      style={styles.tabItem}
      android_ripple={{ color: colors.ripple, borderless: true, radius: 30 }}
    >
      <MaterialCommunityIcons name={icon} size={24} color={active ? colors.primary : colors.textMuted} />
      <Text style={[styles.tabLabel, { fontFamily: labelFont, color: active ? colors.primary : colors.textMuted }]}>{text}</Text>
    </Pressable>
  );
  return (
    <Animated.View entering={FadeInDown.delay(250).duration(500)} style={[styles.tabBar, { height: TAB_BAR + bottom, paddingBottom: bottom }]}>
      {item("home-variant", t("home.home"), null, true)}
      {item("calendar-today", t("hub.today"), "/(app)/today")}
      <View
        ref={micRef}
        onLayout={() =>
          micRef.current?.measureInWindow((x, y, width, height) =>
            setTourTarget("mic", { x, y, width, height })
          )
        }
        collapsable={false}
        style={styles.fabSlot}
      >
        <Pulse color={phaseColor(voice.phase)} />
        <Pressable
          onPress={voice.toggle}
          onLongPress={() => onGo("/(app)/voice")}
          delayLongPress={300}
          accessibilityRole="button"
          accessibilityLabel={t("nav.assistant")}
          accessibilityHint={t("hub.holdToAsk")}
          haptic="thump"
          pressScale={0.9}
          onDark
          android_ripple={{ color: colors.rippleOnDark, borderless: true, radius: 32 }}
          style={[styles.fab, { backgroundColor: phaseColor(voice.phase) }]}
        >
          <MaterialCommunityIcons name="microphone" size={30} color={colors.onPrimary} />
        </Pressable>
        <Text style={[styles.tabLabel, styles.fabLabel, { fontFamily: labelFont }]}>
          {voice.phase === "sleeping" ? t("home.ask") : t(`voice.${voice.phase}`)}
        </Text>
      </View>
      {item("cog-outline", t("nav.settings"), "/(app)/settings")}
    </Animated.View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1 },
    top: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: GUTTER, gap: 12 },
    hello: { color: colors.textSecondary },
    name: { fontSize: 34, lineHeight: 40, color: colors.text, marginTop: 2 },
    glassBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface + "B3",
      borderWidth: 1,
      borderColor: colors.border + "80",
    },

    band: { paddingHorizontal: GUTTER, paddingTop: 6, paddingBottom: 26 },
    date: { color: "rgba(255,255,255,0.72)" },
    bandTitle: { fontSize: 26, lineHeight: 32, color: "#FFFFFF", marginTop: 4 },

    card: {
      height: 178,
      borderRadius: 24,
      backgroundColor: colors.surface,
      padding: 18,
      paddingRight: 96,
      overflow: "hidden",
      gap: 6,
    },
    cardBlob: {
      position: "absolute",
      right: -52,
      top: 22,
      width: 134,
      height: 134,
      borderRadius: 67,
      alignItems: "flex-start",
      justifyContent: "center",
      paddingLeft: 24,
    },
    cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
    cardDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
    cardTitle: { fontSize: 18, color: colors.text, flexShrink: 1 },
    cardValue: { fontSize: 34, lineHeight: 40, color: colors.text },
    cardUnit: { fontSize: 15, color: colors.textMuted },
    cardBody: { fontSize: 13, lineHeight: 18, color: colors.textSecondary },
    cardEmoji: { fontSize: 42 },
    cardFoot: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: "auto" },
    cardSpeak: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceSoft,
    },
    cardGo: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },

    grid: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 18 },
    tile: {
      height: 172,
      borderRadius: 24,
      padding: 16,
      overflow: "hidden",
      justifyContent: "space-between",
    },
    tileBlobA: {
      position: "absolute",
      right: -34,
      bottom: -44,
      width: 130,
      height: 130,
      borderRadius: 65,
      backgroundColor: "rgba(255,255,255,0.14)",
    },
    tileBlobB: {
      position: "absolute",
      left: -20,
      top: -26,
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: "rgba(255,255,255,0.10)",
    },
    iconBox: {
      alignSelf: "center",
      width: 76,
      height: 76,
      borderRadius: 22,
      backgroundColor: "rgba(255,255,255,0.95)",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 6,
    },
    tileEmoji: { fontSize: 40 },
    speak: {
      position: "absolute",
      top: 10,
      right: 10,
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.18)",
      zIndex: 2,
    },
    speakSmall: { top: 6, right: 6, width: 28, height: 28, borderRadius: 14 },
    tileLabel: {
      fontSize: 18,
      lineHeight: 22,
      color: "#FFFFFF",
      textShadowColor: "rgba(0,0,0,0.18)",
      textShadowRadius: 4,
    },

    sheet: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      paddingHorizontal: GUTTER,
      paddingTop: 24,
      paddingBottom: 20,
      minHeight: 260,
    },
    sheetTitle: { fontSize: 22, lineHeight: 28, color: colors.text },
    moreItem: { width: 112, gap: 8 },
    moreTile: {
      height: 92,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    moreBlob: {
      position: "absolute",
      right: -20,
      top: -24,
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: "rgba(255,255,255,0.16)",
    },
    moreEmoji: { fontSize: 38 },
    moreLabel: { fontSize: 13, lineHeight: 17, color: colors.text, fontWeight: "600" },

    tabBar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      elevation: 16,
      shadowColor: "#000",
      shadowOpacity: 0.12,
      shadowRadius: 16,
    },
    tabItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, height: TAB_BAR },
    tabLabel: { fontSize: 11, fontWeight: "600" },
    fabSlot: { flex: 1, alignItems: "center" },
    fabLabel: { color: colors.primary, marginTop: 2 },
    pulse: {
      position: "absolute",
      top: -34,
      width: 66,
      height: 66,
      borderRadius: 33,
      backgroundColor: colors.primary,
    },
    fab: {
      width: 66,
      height: 66,
      borderRadius: 33,
      marginTop: -34,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
      borderWidth: 5,
      borderColor: colors.surface,
      elevation: 10,
      shadowColor: colors.primary,
      shadowOpacity: 0.4,
      shadowRadius: 12,
    },
  }),
);
