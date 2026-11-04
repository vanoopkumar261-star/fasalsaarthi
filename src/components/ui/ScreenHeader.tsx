import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { speak, stopSpeaking } from "../../lib/speech";
import { guide } from "../../lib/voiceGuide";
import { bodyFont, colors, displayFont, layout, radius, space, type, themed } from "../../theme";
import { useT } from "../i18n/LanguageProvider";

type Props = {
  title: string;
  /** Spoken when the farmer taps the speaker. Falls back to the title. */
  readAloud?: string;
  right?: React.ReactNode;
};

/**
 * Every screen's chrome, now that there is no tab bar.
 *
 * Back is a 44dp target and always returns to where you came from, which the
 * old header could not do: it was a bare chevron that said the literal word
 * "More" on all seven sub-screens regardless of which one you were on.
 */
export function ScreenHeader({ title, readAloud, right }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useT();

  // Talking app: say where the farmer just landed.
  useEffect(() => {
    guide(title, locale);
  }, [title, locale]);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + space.xxs }]}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/(app)/hub"))}
        accessibilityRole="button"
        accessibilityLabel={t("screen.back")}
        hitSlop={6}
        style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="chevron-left" size={30} color={colors.primary} />
      </Pressable>

      <Text
        numberOfLines={2}
        style={[styles.title, { fontFamily: displayFont(locale), fontWeight: displayFont(locale) ? undefined : "700" }]}
      >
        {title}
      </Text>

      <View style={styles.right}>
        {right}
        <Pressable
          onPress={() => {
            stopSpeaking();
            speak(readAloud ?? title, locale);
          }}
          accessibilityRole="button"
          accessibilityLabel={t("screen.readAloud")}
          hitSlop={6}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="volume-high" size={22} color={colors.leaf} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingBottom: space.xs,
  },
  iconBtn: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { backgroundColor: colors.surfaceSoft },
  title: { flex: 1, ...type.title, color: colors.text },
  right: { flexDirection: "row", alignItems: "center" },
}));
