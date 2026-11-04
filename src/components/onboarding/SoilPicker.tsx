import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { bodyFont, cardShadow, colors, radius, space, type, themed } from "@/theme";
import { useT } from "../i18n/LanguageProvider";

/**
 * Soil chosen by picture rather than by reading a chip.
 *
 * The web onboarding learned this the hard way: with a pre-filled dropdown, 35
 * of 60 farms came back as "Alluvial Soil" — not an answer, a form nobody
 * opened. A farmer who cannot comfortably read the label accepts whatever it
 * already says. So there is no default and nothing to read in order to choose;
 * the photograph carries the meaning and the label underneath confirms it.
 *
 * Photos are the same 640x400 webp assets the website serves, so the two
 * clients show a farmer the identical picture of their own soil.
 */

/** Slugs match the web's SoilKey and the asset filenames. */
const SOIL_META: Record<string, { slug: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"] }> = {
  "Alluvial Soil": { slug: "alluvial", icon: "waves" },
  "Black Soil": { slug: "black", icon: "grid" },
  "Red Soil": { slug: "red", icon: "grain" },
  "Sandy Soil": { slug: "sandy", icon: "dots-horizontal" },
  "Clayey Soil": { slug: "clayey", icon: "layers-outline" },
};

// require() cannot take a template string — Metro resolves these at build time.
const SOIL_IMAGES: Record<string, ImageSourcePropType> = {
  alluvial: require("../../../assets/images/soil/alluvial.webp"),
  black: require("../../../assets/images/soil/black.webp"),
  red: require("../../../assets/images/soil/red.webp"),
  sandy: require("../../../assets/images/soil/sandy.webp"),
  clayey: require("../../../assets/images/soil/clayey.webp"),
};

export function SoilPicker({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (next: string) => void;
}) {
  const { t, locale } = useT();

  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {options.map((opt) => {
        const meta = SOIL_META[opt];
        const active = opt === value;
        const label = t(`soilType.${meta?.slug ?? opt}`);

        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
            style={[styles.card, cardShadow, active && styles.cardActive]}
          >
            <View style={styles.thumbWrap}>
              {meta ? (
                <Image
                  source={SOIL_IMAGES[meta.slug]}
                  style={styles.thumb}
                  contentFit="cover"
                  transition={120}
                />
              ) : (
                <View style={[styles.thumb, { backgroundColor: colors.surfaceSoft }]} />
              )}

              {/* At thumbnail size red and alluvial read alike; the glyph does not. */}
              {meta && (
                <View style={styles.glyph}>
                  <MaterialCommunityIcons name={meta.icon} size={13} color={colors.primary} />
                </View>
              )}

              {active && (
                <View style={styles.check}>
                  <MaterialCommunityIcons name="check" size={13} color={colors.onPrimary} />
                </View>
              )}
            </View>

            <Text
              numberOfLines={2}
              style={[
                styles.label,
                active && styles.labelActive,
                { fontFamily: bodyFont(locale, active ? "semi" : "medium") },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  card: {
    flexBasis: "31%",
    flexGrow: 1,
    minWidth: 96,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  cardActive: { borderColor: colors.primary, borderWidth: 2 },
  thumbWrap: { height: 72, width: "100%", backgroundColor: colors.surfaceSoft },
  thumb: { height: "100%", width: "100%" },
  glyph: {
    position: "absolute",
    left: 5,
    top: 5,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(18,19,22,0.92)",
  },
  check: {
    position: "absolute",
    right: 5,
    top: 5,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  label: { ...type.secondary, color: colors.textSecondary, paddingHorizontal: space.xs, paddingVertical: 6 },
  labelActive: { color: colors.text },
}));
