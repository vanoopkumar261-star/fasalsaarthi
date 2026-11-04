import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/components/i18n/LanguageProvider";
import { useVoiceAgent, VoiceStatus } from "@/components/agent/VoiceAgent";
import { bodyFont, colors, layout, radius, space, type, themed } from "@/theme";

/**
 * The always-on assistant, full screen: the same conversation the floating
 * orb runs everywhere else (components/agent/VoiceAgent.tsx), drawn large
 * with what was heard and what was said, for a farmer who wants to watch it.
 */
export default function VoiceRoute() {
  const router = useRouter();
  const { t, locale } = useT();
  const insets = useSafeAreaInsets();
  const { phase, heard, reply, toggle } = useVoiceAgent();

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + space.lg }]}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t("voice.end")}
        style={styles.close}
      >
        <MaterialCommunityIcons name="close" size={26} color={colors.textOnDarkSoft} />
      </Pressable>

      <View style={styles.centre}>
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={t("voice.dictate")}
          style={[styles.orb, phase === "listening" && styles.orbLive, phase === "sleeping" && styles.orbAsleep]}
        >
          <MaterialCommunityIcons
            name={phase === "speaking" ? "volume-high" : phase === "sleeping" ? "microphone-outline" : "microphone"}
            size={56}
            color={colors.onPrimary}
          />
        </Pressable>

        <VoiceStatus onDark />

        {heard ? <Text style={[styles.question, { fontFamily: bodyFont(locale) }]}>{heard}</Text> : null}

        {/* The reply is always shown as text, not only spoken: seven of the nine
            languages may have no voice installed on a given device. */}
        {reply ? <Text style={[styles.reply, { fontFamily: bodyFont(locale) }]}>{reply}</Text> : null}
      </View>

      <Text style={[styles.privacy, { fontFamily: bodyFont(locale) }]}>{t("voice.privacy")}</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bandDeep, paddingHorizontal: layout.screenX },
  close: {
    alignSelf: "flex-end",
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md },
  orb: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  orbLive: { borderWidth: 6, borderColor: "rgba(201,162,39,0.35)" },
  orbAsleep: { backgroundColor: colors.primary },
  question: { ...type.section, color: colors.textOnDark, textAlign: "center" },
  reply: {
    ...type.body,
    color: colors.textOnDarkSoft,
    textAlign: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: radius.card,
    padding: space.md,
  },
  privacy: { ...type.meta, color: colors.textOnDarkSoft, textAlign: "center", opacity: 0.7 },
}));
