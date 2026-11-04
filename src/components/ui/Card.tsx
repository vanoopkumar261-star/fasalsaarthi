import { StyleSheet, View, type ViewProps, type ViewStyle } from "react-native";
import { cardShadow, colors, layout, radius, space, themed } from "../../theme";

type Props = ViewProps & {
  /** Removes the internal padding when the card holds its own full-bleed rows. */
  flush?: boolean;
  tone?: "surface" | "soft" | "danger";
  style?: ViewStyle | ViewStyle[];
};

/**
 * The one card surface.
 *
 * The identical eight-line card style block used to be copy-pasted into eight
 * screens, which is how four different "card" radii (16, 18, 20, 24, 26) ended
 * up in the app. Paper over paper: a hairline border does the work, the shadow
 * is barely there.
 */
export function Card({ flush, tone = "surface", style, children, ...rest }: Props) {
  return (
    <View
      style={[
        styles.base,
        tone === "soft" && styles.soft,
        tone === "danger" && styles.danger,
        !flush && styles.padded,
        cardShadow,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: space.sm,
  },
  padded: { padding: layout.cardPadding },
  soft: { backgroundColor: colors.surfaceSoft },
  danger: { backgroundColor: colors.dangerSoft, borderColor: "rgba(239,111,87,0.3)" },
}));
