import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { bodyFont, colors, displayFont, eyebrow, layout, radius, space, tabularNums, type, themed } from "../../theme";
import { useT } from "../i18n/LanguageProvider";
import { Card } from "./Card";

/* ------------------------------------------------------------------ Badge */

type Tone = "neutral" | "positive" | "attention" | "critical" | "info" | "gold";

const TONES: Record<Tone, { bg: string; fg: string }> = themed(() => ({
  neutral: { bg: colors.surfaceSoft, fg: colors.textSecondary },
  positive: { bg: colors.surfaceSoft, fg: colors.optimal },
  attention: { bg: "rgba(227,179,65,0.14)", fg: colors.attention },
  critical: { bg: colors.dangerSoft, fg: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.info },
  // Gold as a fill would be unreadable at 2.2:1, so the ink is the dark gold.
  gold: { bg: colors.accentSoft, fg: colors.goldInk },
}));

export function Badge({
  label,
  tone = "neutral",
  icon,
}: {
  label: string;
  tone?: Tone;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
}) {
  const { locale } = useT();
  const c = TONES[tone];
  return (
    <View style={[s.badge, { backgroundColor: c.bg }]}>
      {icon && <MaterialCommunityIcons name={icon} size={13} color={c.fg} />}
      <Text style={[s.badgeText, { color: c.fg, fontFamily: bodyFont(locale, "semi") }]}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------- Chip */

export function Chip({
  label,
  selected,
  onPress,
  dotColor,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  dotColor?: string;
}) {
  const { locale } = useT();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [s.chip, selected && s.chipOn, pressed && { opacity: 0.85 }]}
    >
      {dotColor && <View style={[s.dot, { backgroundColor: dotColor }]} />}
      <Text
        style={[
          s.chipText,
          selected && { color: colors.onPrimary },
          { fontFamily: bodyFont(locale, "medium") },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* --------------------------------------------------------------- StatTile */

/**
 * Re-implemented separately in CropsScreen and ExpensesScreen before this
 * existed, with different padding, radii and value sizes in each.
 */
export function StatTile({
  label,
  value,
  unit,
  icon,
  tone = "neutral",
  style,
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  tone?: Tone;
  style?: ViewStyle;
}) {
  const { locale } = useT();
  return (
    <Card style={[s.tile, style as ViewStyle]}>
      <View style={s.tileHead}>
        <Text style={[eyebrow, s.tileLabel, { fontFamily: bodyFont(locale, "semi") }]} numberOfLines={2}>
          {label}
        </Text>
        {icon && <MaterialCommunityIcons name={icon} size={16} color={colors.leaf} />}
      </View>
      <View style={s.tileValueRow}>
        <Text style={[s.tileValue, tabularNums, { color: TONES[tone].fg, fontFamily: displayFont(locale) }]}>
          {value}
        </Text>
        {unit ? (
          <Text style={[s.tileUnit, { fontFamily: bodyFont(locale) }]} numberOfLines={1}>
            {unit}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/* ---------------------------------------------------------- SectionHeader */

export function SectionHeader({
  title,
  action,
  onAction,
  icon,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
}) {
  const { locale } = useT();
  return (
    <View style={s.sectionRow}>
      {icon && (
        <View style={s.sectionIcon}>
          <MaterialCommunityIcons name={icon} size={16} color={colors.primary} />
        </View>
      )}
      <Text style={[s.sectionTitle, { fontFamily: bodyFont(locale, "semi") }]} numberOfLines={2}>
        {title}
      </Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button" style={s.sectionAction}>
          <Text style={[s.sectionActionText, { fontFamily: bodyFont(locale, "semi") }]}>{action}</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={colors.leaf} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------- ErrorState */

/**
 * The visible failure the app mostly lacked: screens either rendered data or
 * rendered nothing, so a farmer could not tell an empty farm from a broken app.
 */
export function ErrorState({
  message,
  onRetry,
  retryLabel,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const { locale } = useT();
  return (
    <Card tone="danger" style={s.error}>
      <View style={s.errorRow}>
        <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.danger} />
        <Text style={[s.errorText, { fontFamily: bodyFont(locale) }]}>{message}</Text>
      </View>
      {onRetry && retryLabel ? (
        <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8} style={s.retry}>
          <MaterialCommunityIcons name="refresh" size={16} color={colors.danger} />
          <Text style={[s.retryText, { fontFamily: bodyFont(locale, "semi") }]}>{retryLabel}</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

/* ---------------------------------------------------------------- Divider */

export function Divider() {
  return <View style={s.divider} />;
}

const s = themed(() => StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: space.xs + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  badgeText: { ...type.meta, letterSpacing: 0.2 },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...type.secondary, color: colors.textSecondary },
  dot: { width: 10, height: 10, borderRadius: 5 },

  tile: { flex: 1, minWidth: 140, gap: space.xs, padding: space.md },
  tileHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 6 },
  tileLabel: { color: colors.textMuted, flex: 1 },
  tileValueRow: { flexDirection: "row", alignItems: "baseline", gap: 4, flexWrap: "wrap" },
  tileValue: { fontSize: 24, lineHeight: 30, fontWeight: "700" },
  tileUnit: { ...type.secondary, color: colors.textMuted },

  sectionRow: { flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: 32 },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { ...type.section, color: colors.text, flex: 1 },
  sectionAction: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: layout.touchTarget - 12,
    paddingLeft: space.xs,
  },
  sectionActionText: { ...type.secondary, color: colors.leaf },

  error: { gap: space.xs },
  errorRow: { flexDirection: "row", alignItems: "flex-start", gap: space.xs },
  errorText: { ...type.body, color: colors.danger, flex: 1 },
  retry: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: layout.touchTarget - 8 },
  retryText: { ...type.secondary, color: colors.danger },

  divider: { height: 1, backgroundColor: colors.border },
}));
