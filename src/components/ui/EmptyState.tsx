import { StyleSheet, Text, View } from "react-native";
import { colors as tokens, themed } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/constants/colors";

/** Icon-in-a-soft-circle treatment for first-run / zero-data moments, instead of bare text. */
export function EmptyState({
  icon,
  title,
  body,
  tone = "sage",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  tone?: "sage" | "pink";
}) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.circle, tone === "pink" && styles.circlePink]}>
        <Ionicons name={icon} size={28} color={tone === "pink" ? tokens.blushInk : colors.leaf} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 22, paddingHorizontal: 8, gap: 6 },
  circle: {
    width: 60,
    height: 60,
    borderRadius: 24,
    backgroundColor: colors.sage,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  circlePink: { backgroundColor: tokens.blush },
  title: { fontSize: 15, fontWeight: "700", color: colors.ink, textAlign: "center" },
  body: { fontSize: 13, color: colors.textFaint, textAlign: "center", lineHeight: 18, maxWidth: 260 },
}));
