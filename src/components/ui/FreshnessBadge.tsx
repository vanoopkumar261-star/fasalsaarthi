import { StyleSheet, Text, View } from "react-native";
import { colors as tokens, themed } from "@/theme";
import { colors } from "@/constants/colors";

/**
 * Communicates whether the data on screen is live, an estimate, or stale —
 * per the design spec's rule that live and estimated data must never look
 * identical (docs/DESIGN_SPEC_V1.md §20, §51). Uses the status palette:
 * live = optimal, estimated = attention, offline = neutral.
 */
export function FreshnessBadge({ label, tone = "live" }: { label: string; tone?: "live" | "estimated" | "offline" }) {
  return (
    <View style={[styles.badge, tone === "estimated" && styles.badgeEstimated, tone === "offline" && styles.badgeOffline]}>
      {tone === "live" && <View style={styles.dot} />}
      <Text
        style={[
          styles.text,
          tone === "estimated" && styles.textEstimated,
          tone === "offline" && styles.textOffline,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: colors.sage,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeEstimated: { backgroundColor: tokens.accentSoft, borderWidth: 1, borderColor: colors.attention + "40" },
  badgeOffline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.neutral + "40" },
  dot: { width: 5, height: 5, borderRadius: 8, backgroundColor: colors.optimal },
  text: { fontSize: 12, fontWeight: "700", color: colors.optimal },
  textEstimated: { color: colors.attention },
  textOffline: { color: colors.neutral },
}));
