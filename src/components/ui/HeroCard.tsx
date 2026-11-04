import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/constants/colors";
import { activeScheme, colors as tokens, layout, radius, themed } from "@/theme";

/**
 * Big rounded gradient hero card — the app's stand-in for the reference
 * design's edge-to-edge photo cards (we have no farm photography, so a
 * brand-gradient + bold overlaid type carries the same visual weight).
 */
export function HeroCard({
  eyebrow,
  title,
  meta,
  badge,
  icon,
  tone = "green",
  progressPct,
  style,
  children,
}: {
  eyebrow?: string;
  title: string;
  meta?: string;
  badge?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: "green" | "mustard" | "critical";
  progressPct?: number;
  style?: ViewStyle;
  children?: React.ReactNode;
}) {
  const gradient = GRADIENTS[tone];
  return (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, style]}>
      <View style={styles.topRow}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : <View />}
        {icon ? (
          <View style={styles.iconBadge}>
            <Ionicons name={icon} size={16} color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      <Text style={styles.title}>{title}</Text>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      {progressPct != null ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, progressPct))}%` }]} />
        </View>
      ) : null}
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      {children}
    </LinearGradient>
  );
}

// Was three pairs of raw hexes, two of which (#8A6A12, #7A1F1F) existed only
// here. Now every stop is a token, so a palette change reaches the hero cards.
const GRADIENTS: Record<"green" | "mustard" | "critical", [string, string]> = themed(() => ({
  // Deep bands in both schemes, so white type stays ≥ 7:1.
  green: [tokens.band, tokens.bandDeep],
  mustard: activeScheme() === "dark" ? ["#3A2E12", tokens.accentSoft] : ["#B07B22", "#8A5E14"],
  critical: activeScheme() === "dark" ? ["#4A1F17", tokens.dangerSoft] : ["#B4553F", "#8F3F2D"],
}));

const styles = themed(() => StyleSheet.create({
  card: { borderRadius: radius.lg, padding: layout.cardPadding, gap: 6, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 0.8, color: "rgba(255,255,255,0.82)" },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 24, fontWeight: "700", color: "#FFFFFF" },
  meta: { fontSize: 13, color: "rgba(255,255,255,0.85)" },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  badgeText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
  progressTrack: {
    height: 7,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.25)",
    overflow: "hidden",
    marginTop: 6,
  },
  progressFill: { height: 7, borderRadius: 8, backgroundColor: tokens.accent },
}));
