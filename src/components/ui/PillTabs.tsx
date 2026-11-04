import { colors as themeColors } from "@/theme/colors";
import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { colors } from "@/constants/colors";
import { themed } from "@/theme";

/** Segmented pill control — dark-green selected pill on a light track. */
export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={styles.track}>
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <Pressable key={t.key} onPress={() => onChange(t.key)} style={[styles.pill, active && styles.pillActive]}>
            <Text style={[styles.label, active && styles.labelActive]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: colors.sage,
    borderRadius: 999,
    padding: 4,
    gap: 2,
  },
  pill: { flex: 1, borderRadius: 999, paddingVertical: 9, alignItems: "center" },
  pillActive: { backgroundColor: colors.primary },
  label: { fontSize: 13, fontWeight: "700", color: colors.leaf },
  labelActive: { color: themeColors.onPrimary },
}));
