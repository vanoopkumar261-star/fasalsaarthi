import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { bodyFont, colors, layout, radius, space, type, themed } from "../../theme";
import { useT } from "../i18n/LanguageProvider";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  /** Trailing icon instead of leading — for "open in maps"-style actions. */
  iconAfter?: boolean;
  busy?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: ViewStyle | ViewStyle[];
};

/**
 * Hierarchy comes from the SURFACE, not from type weight or size — one solid
 * fill, one outline, one bare. Four variants is the ceiling; the spec's warning
 * about too many button styles is what the old screens each inventing their own
 * CTA looked like in practice.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  iconAfter,
  busy,
  disabled,
  full,
  style,
}: Props) {
  const { locale } = useT();
  const off = disabled || busy;
  const fg =
    variant === "primary" ? colors.onPrimary : variant === "danger" ? colors.danger : colors.primary;

  const glyph = icon ? <MaterialCommunityIcons name={icon} size={20} color={fg} /> : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onDark={variant === "primary"}
      style={({ pressed }) => [
        styles.base,
        variants[variant],
        full && styles.full,
        pressed && !off && styles.pressed,
        off && styles.off,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {!iconAfter && glyph}
          <Text
            numberOfLines={2}
            style={[styles.label, { color: fg, fontFamily: bodyFont(locale, "semi") }]}
          >
            {label}
          </Text>
          {iconAfter && glyph}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: layout.touchTarget + 4,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  full: { alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: space.xs },
  // Buttons must grow with the label, not clip it: §50 forbids fixed text
  // widths, and "Continue" is three times longer in Malayalam.
  label: { ...type.body, textAlign: "center", flexShrink: 1 },
  pressed: { opacity: 0.88 },
  off: { opacity: 0.5 },
});

const variants = themed(() => StyleSheet.create({
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: "rgba(239,111,87,0.35)" },
}));
