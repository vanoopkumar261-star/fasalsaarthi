import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { colors, type Scheme } from "../../theme";

/**
 * The home screen's illustrated valley: sky, sun or moon, clouds, birds,
 * three mountain ridges, a lake, and pine forest running down into the teal
 * band the content sits on. Each layer is its own SVG so it can move on its
 * own: layers slide at different speeds as the page scrolls (parallax), rise
 * into place on open, and clouds and birds drift. At night it is the same
 * valley under a moon, with stars and fireflies.
 */
const VW = 400;
const VH = 380;

type Palette = {
  skyTop: string;
  skyBottom: string;
  orb: string;
  orbGlow: string;
  cloud: string;
  far: string;
  mid: string;
  sand: string;
  lakeTop: string;
  lakeBottom: string;
  hills: string;
  pinesBack: string;
};

const DAY: Palette = {
  skyTop: "#A9DCEB",
  skyBottom: "#E9F5EC",
  orb: "#FFFBEA",
  orbGlow: "#FFF4C2",
  cloud: "#FFFFFF",
  far: "#9DC3CB",
  mid: "#7DA59C",
  sand: "#D8C7A0",
  lakeTop: "#B5DDE2",
  lakeBottom: "#8CC2C8",
  hills: "#5F8F79",
  pinesBack: "#46725F",
};

const NIGHT: Palette = {
  skyTop: "#070B14",
  skyBottom: "#16302A",
  orb: "#F4ECD2",
  orbGlow: "#C9D6B0",
  cloud: "#2A3A40",
  far: "#1C3236",
  mid: "#1D3A33",
  sand: "#3A3A2C",
  lakeTop: "#123236",
  lakeBottom: "#0C2427",
  hills: "#1A3A31",
  pinesBack: "#143029",
};

/**
 * The colour the forest floor and the content panel share, so the valley runs
 * into the page without a seam. Day: the teal band. Night: a forest black-green.
 */
export const panelColor = (scheme: Scheme) => (scheme === "dark" ? "#0F1F1A" : colors.band);

/** Ridgeline through points — straight runs, so peaks read as peaks — closed to the bottom. */
function ridge(pts: [number, number][], bottom = VH): string {
  return `M0,${bottom} ` + pts.map(([x, y]) => `L${x},${y}`).join(" ") + ` L${VW},${bottom} Z`;
}

/** A pine: three stacked triangles on a short trunk. */
function pine(x: number, base: number, h: number): string {
  const w = h * 0.42;
  let d = `M${x - 1.2},${base} h2.4 v${-h * 0.18} h-2.4 Z`;
  for (let i = 0; i < 3; i++) {
    const top = base - h + i * h * 0.24;
    const bot = base - h * 0.16 - (2 - i) * h * 0.2;
    const ww = w * (0.55 + i * 0.22);
    d += ` M${x},${top} L${x + ww / 2},${bot} L${x - ww / 2},${bot} Z`;
  }
  return d;
}

/** Deterministic scatter so trees and stars don't jump between renders. */
const rnd = (i: number, s: number) => {
  const v = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

function forest(count: number, baseMin: number, baseMax: number, hMin: number, hMax: number, seed: number) {
  let d = "";
  for (let i = 0; i < count; i++) {
    const x = (i / (count - 1)) * (VW + 20) - 10 + (rnd(i, seed) - 0.5) * 14;
    const base = baseMin + rnd(i, seed + 1) * (baseMax - baseMin);
    d += pine(x, base, hMin + rnd(i, seed + 2) * (hMax - hMin)) + " ";
  }
  return d;
}

const FAR = ridge([[0, 176], [38, 150], [70, 166], [122, 104], [150, 130], [176, 150], [214, 128], [240, 146], [292, 96], [320, 122], [352, 150], [384, 128], [400, 140]]);
const MID = ridge([[0, 206], [44, 178], [86, 204], [118, 196], [168, 158], [206, 196], [250, 206], [300, 170], [336, 198], [372, 186], [400, 204]]);
const SAND = ridge([[130, 240], [176, 214], [204, 222], [236, 198], [270, 220], [300, 210], [350, 240]]);
const HILLS = ridge([[0, 262], [80, 246], [160, 268], [250, 250], [330, 266], [400, 248]]);
const PINES_BACK = forest(26, 262, 280, 26, 44, 3);
const PINES_FRONT = forest(14, 330, 360, 60, 96, 9);

export function ValleyHeader({
  width,
  height,
  scheme,
  scrollY,
  still,
}: {
  width: number;
  height: number;
  scheme: Scheme;
  scrollY: SharedValue<number>;
  still: boolean;
}) {
  const p = scheme === "dark" ? NIGHT : DAY;
  const night = scheme === "dark";

  // Rise-in on open: back layers first, the forest last.
  const rise = useSharedValue(still ? 1 : 0);
  // Ambient loops: cloud drift, bird crossing, orb breathing.
  const drift = useSharedValue(0);
  const birds = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (still) return;
    rise.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
    drift.value = withRepeat(withTiming(1, { duration: 40000, easing: Easing.linear }), -1);
    birds.value = withDelay(800, withRepeat(withTiming(1, { duration: 16000, easing: Easing.inOut(Easing.quad) }), -1));
    glow.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [still, rise, drift, birds, glow]);

  // depth: 0 = sky (moves least), 1 = foreground (moves most).
  const layer = (depth: number, delay: number) => {
    "worklet";
    const r = interpolate(rise.value, [delay, Math.min(1, delay + 0.6)], [0, 1], "clamp");
    return {
      opacity: depth === 0 ? 1 : r,
      transform: [
        { translateY: (1 - r) * 40 * depth + scrollY.value * (0.5 - depth * 0.45) },
        { scale: 1 + Math.max(0, -scrollY.value) / 900 },
      ],
    };
  };
  const sky = useAnimatedStyle(() => layer(0, 0));
  const far = useAnimatedStyle(() => layer(0.25, 0.05));
  const mid = useAnimatedStyle(() => layer(0.45, 0.15));
  const hills = useAnimatedStyle(() => layer(0.7, 0.3));
  const front = useAnimatedStyle(() => layer(1, 0.4));
  const cloudStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -drift.value * width }, { translateY: scrollY.value * 0.45 }],
  }));
  const birdStyle = useAnimatedStyle(() => ({
    opacity: interpolate(birds.value, [0, 0.1, 0.85, 1], [0, 1, 1, 0]),
    transform: [
      { translateX: interpolate(birds.value, [0, 1], [-width * 0.2, width * 1.1]) },
      { translateY: interpolate(birds.value, [0, 0.5, 1], [0, -18, 6]) + scrollY.value * 0.45 },
    ],
  }));
  const orbStyle = useAnimatedStyle(() => ({ opacity: 0.55 + glow.value * 0.45, transform: [{ scale: 1 + glow.value * 0.08 }] }));

  const stars = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        x: rnd(i, 21) * VW,
        y: rnd(i, 22) * 170,
        r: 0.5 + rnd(i, 23) * 1.1,
        o: 0.4 + rnd(i, 24) * 0.6,
      })),
    [],
  );

  const svg = { width, height, viewBox: `0 0 ${VW} ${VH}`, preserveAspectRatio: "xMidYMax slice" as const };
  const fill = StyleSheet.absoluteFill;

  return (
    <View style={{ width, height, overflow: "hidden" }} pointerEvents="none">
      <Animated.View style={[fill, sky]}>
        <Svg {...svg}>
          <Defs>
            <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={p.skyTop} />
              <Stop offset="1" stopColor={p.skyBottom} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={VW} height={VH} fill="url(#sky)" />
          {night && stars.map((s, i) => <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" opacity={s.o} />)}
          <Circle cx={night ? 300 : 245} cy={night ? 70 : 128} r={night ? 17 : 20} fill={p.orb} />
        </Svg>
      </Animated.View>

      {/* Glow around the sun or moon, breathing slowly. */}
      <Animated.View style={[fill, orbStyle]}>
        <Svg {...svg}>
          <Circle cx={night ? 300 : 245} cy={night ? 70 : 128} r={44} fill={p.orbGlow} opacity={night ? 0.18 : 0.35} />
          <Circle cx={night ? 300 : 245} cy={night ? 70 : 128} r={30} fill={p.orbGlow} opacity={night ? 0.22 : 0.4} />
        </Svg>
      </Animated.View>

      {/* Two copies side by side so the drift loops seamlessly. */}
      <Animated.View style={[{ position: "absolute", top: 0, left: 0, width: width * 2, height, flexDirection: "row" }, cloudStyle]}>
        {[0, 1].map((k) => (
          <Svg key={k} {...svg}>
            <G opacity={night ? 0.5 : 0.9} fill={p.cloud}>
              <Ellipse cx="70" cy="92" rx="38" ry="11" />
              <Ellipse cx="92" cy="84" rx="22" ry="12" />
              <Ellipse cx="300" cy="150" rx="46" ry="10" />
              <Ellipse cx="320" cy="142" rx="24" ry="11" />
              <Ellipse cx="190" cy="58" rx="30" ry="7" />
            </G>
          </Svg>
        ))}
      </Animated.View>

      {!night && (
        <Animated.View style={[fill, birdStyle]}>
          <Svg {...svg}>
            <G stroke="#2F4A44" strokeWidth={1.6} fill="none" strokeLinecap="round">
              {[[40, 110], [58, 102], [50, 124], [72, 116], [30, 98], [84, 106]].map(([x, y], i) => (
                <Path key={i} d={`M${x - 5},${y - 2} Q${x - 2},${y - 5} ${x},${y} Q${x + 2},${y - 5} ${x + 5},${y - 2}`} />
              ))}
            </G>
          </Svg>
        </Animated.View>
      )}

      <Animated.View style={[fill, far]}>
        <Svg {...svg}>
          <Defs>
            <LinearGradient id="mist" x1="0" y1="0.25" x2="0" y2="0.6">
              <Stop offset="0" stopColor={p.far} />
              <Stop offset="1" stopColor={p.skyBottom} />
            </LinearGradient>
          </Defs>
          <Path d={FAR} fill="url(#mist)" />
        </Svg>
      </Animated.View>

      <Animated.View style={[fill, mid]}>
        <Svg {...svg}>
          <Defs>
            <LinearGradient id="lake" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={p.lakeTop} />
              <Stop offset="1" stopColor={p.lakeBottom} />
            </LinearGradient>
          </Defs>
          <Defs>
            <LinearGradient id="mist2" x1="0" y1="0.4" x2="0" y2="0.66">
              <Stop offset="0" stopColor={p.mid} />
              <Stop offset="1" stopColor={p.skyBottom} stopOpacity={0.9} />
            </LinearGradient>
          </Defs>
          <Path d={MID} fill="url(#mist2)" />
          <Path d={SAND} fill={p.sand} opacity={0.9} />
          <Rect x="0" y="238" width={VW} height="40" fill="url(#lake)" />
          {/* Sun or moon on the water. */}
          <Rect x={night ? 290 : 236} y="244" width="20" height="2" rx="1" fill={p.orb} opacity={0.6} />
          <Rect x={night ? 294 : 240} y="252" width="12" height="2" rx="1" fill={p.orb} opacity={0.4} />
          <Rect x={night ? 297 : 243} y="260" width="6" height="2" rx="1" fill={p.orb} opacity={0.3} />
        </Svg>
      </Animated.View>

      <Animated.View style={[fill, hills]}>
        <Svg {...svg}>
          <Path d={HILLS} fill={p.hills} />
          <Path d={PINES_BACK} fill={p.pinesBack} />
        </Svg>
      </Animated.View>

      <Animated.View style={[fill, front]}>
        <Svg {...svg}>
          <Path d={ridge([[0, 320], [100, 306], [200, 318], [300, 304], [400, 316]])} fill={panelColor(scheme)} />
          <Path d={PINES_FRONT} fill={panelColor(scheme)} />
          {/* The forest floor runs straight into the content band. */}
          <Rect x="0" y="352" width={VW} height="40" fill={panelColor(scheme)} />
        </Svg>
      </Animated.View>

      {night && <Fireflies width={width} height={height} />}
    </View>
  );
}

function Fireflies({ width, height }: { width: number; height: number }) {
  return (
    <>
      {Array.from({ length: 9 }, (_, i) => (
        <Firefly key={i} x={rnd(i, 31) * width} y={height * (0.62 + rnd(i, 32) * 0.25)} delay={rnd(i, 33) * 2500} />
      ))}
    </>
  );
}

function Firefly({ x, y, delay }: { x: number; y: number; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.2 + t.value * 0.8,
    transform: [{ translateY: -t.value * 14 }, { translateX: Math.sin(t.value * 6) * 4 }],
  }));
  return <Animated.View style={[styles.fly, { left: x, top: y }, style]} />;
}

const styles = StyleSheet.create({
  fly: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#F0D66A",
    shadowColor: "#F0D66A",
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
});
