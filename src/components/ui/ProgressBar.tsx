import { View, StyleSheet } from "react-native";
import { colors } from "@/constants/colors";

import { themed } from "@/theme";
export function ProgressBar({ pct, tone = "optimal" }: { pct: number; tone?: "optimal" | "attention" | "danger" }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const fillColor = tone === "danger" ? colors.danger : tone === "attention" ? colors.attention : colors.optimal;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: fillColor }]} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  track: { height: 6, borderRadius: 8, backgroundColor: colors.sageLine, overflow: "hidden" },
  fill: { height: 6, borderRadius: 8 },
}));
