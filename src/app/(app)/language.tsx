import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { useT } from "@/components/i18n/LanguageProvider";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { speak } from "@/lib/speech";
import { bodyFont, cardShadow, colors, layout, radius, space, type, themed } from "@/theme";

/**
 * Language lives on the hub's top bar, not three levels down in settings — it
 * is the first thing a farmer needs and the one setting that changes every
 * other screen. The speaker on each row reads the language name aloud in that
 * language, so the list works for someone who cannot read any of it.
 */
export default function LanguageRoute() {
  const router = useRouter();
  const { t, locale, setLocale } = useT();

  const choose = (code: Locale) => {
    setLocale(code);
    if (router.canGoBack()) router.back();
    else router.replace("/(app)/hub");
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("hub.language")} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {LOCALES.map((l) => {
          const active = l.code === locale;
          return (
            <Pressable
              key={l.code}
              onPress={() => choose(l.code)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={l.label}
              style={({ pressed }) => [
                styles.row,
                cardShadow,
                active && styles.rowActive,
                pressed && { opacity: 0.9 },
              ]}
            >
              <View style={styles.rowText}>
                <Text style={[styles.native, { fontFamily: l.code === "en" ? bodyFont("en", "semi") : undefined }]}>
                  {l.label}
                </Text>
                <Text style={[styles.latin, { fontFamily: bodyFont("en") }]}>{l.aiName}</Text>
              </View>

              {active ? (
                <View style={styles.check}>
                  <MaterialCommunityIcons name="check" size={18} color={colors.onPrimary} />
                </View>
              ) : (
                <Pressable
                  onPress={() => speak(l.label, l.code)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`${l.aiName}: ${t("screen.readAloud")}`}
                  style={styles.speaker}
                >
                  <MaterialCommunityIcons name="volume-high" size={22} color={colors.leaf} />
                </Pressable>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: layout.screenX, paddingBottom: layout.screenBottom, gap: space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 72,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: space.sm,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowActive: { backgroundColor: colors.surfaceSoft, borderColor: colors.primary, borderWidth: 2 },
  rowText: { flex: 1, gap: 2 },
  native: { ...type.section, color: colors.text, fontWeight: "600" },
  latin: { ...type.secondary, color: colors.textMuted },
  check: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  speaker: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
}));
