import { colors as themeColors } from "@/theme/colors";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { colors } from "@/constants/colors";
import { themed } from "@/theme";

/** Small circular CTA — the reference's dark "go" affordance on cards. */
export function CircleIconButton({
  icon,
  onPress,
  size = 34,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  size?: number;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.btn, { width: size, height: size, borderRadius: size / 2 }]} hitSlop={8}>
      <Ionicons name={icon} size={size * 0.5} color={themeColors.onPrimary} />
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  btn: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
}));
