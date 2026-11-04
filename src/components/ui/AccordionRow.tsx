import { useState } from "react";
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { colors as tokens, duration, themed } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { colors } from "@/constants/colors";
import { cardShadow } from "@/constants/effects";

/**
 * Expandable "day-by-day itinerary" row — icon-thumbnail + title + chevron,
 * revealing detail lines underneath when tapped.
 */
export function AccordionRow({
  icon,
  iconTone = "green",
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconTone?: "green" | "mustard" | "muted";
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // The chevron turns with the row instead of being swapped for another glyph.
  const chevron = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(open ? "180deg" : "0deg", { duration: duration.base }) }],
  }));
  return (
    // `layout` animates this card's height and, because every row carries it,
    // slides the rows below into place instead of letting them jump.
    <Animated.View layout={LinearTransition.duration(duration.base)} style={styles.card}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={styles.row}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={[styles.thumb, iconTone === "mustard" && styles.thumbMustard, iconTone === "muted" && styles.thumbMuted]}>
          <Ionicons
            name={icon}
            size={18}
            color={iconTone === "mustard" ? colors.amberInk : iconTone === "muted" ? colors.textFaint : colors.primary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Animated.View style={chevron}>
          <Ionicons name="chevron-down" size={18} color={colors.textFaint} />
        </Animated.View>
      </Pressable>
      {open && children ? (
        <Animated.View
          entering={FadeIn.duration(duration.base)}
          exiting={FadeOut.duration(duration.fast)}
          style={styles.body}
        >
          {children}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = themed(() => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: 24,
    overflow: "hidden",
    ...cardShadow,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 24,
    backgroundColor: colors.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbMustard: { backgroundColor: tokens.accentSoft },
  thumbMuted: { backgroundColor: colors.bg },
  title: { fontSize: 15, fontWeight: "700", color: colors.ink },
  subtitle: { fontSize: 12, color: colors.textFaint, marginTop: 1 },
  body: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2, gap: 6 },
}));
