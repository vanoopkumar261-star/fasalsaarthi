import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import HazardCheckModal from "@/components/HazardCheckModal";
import { NotificationInbox } from "@/components/NotificationInbox";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useT } from "@/components/i18n/LanguageProvider";
import { getDashboardData } from "@/lib/dashboard";
import { cardShadow, colors, layout, radius, space, type } from "@/theme";

/**
 * Alerts: what the app has already said, and a way to ask what is happening
 * now.
 *
 * This route used to be the hazard check and nothing else — it opened the
 * sheet directly, because the phone had no notification history to show. It
 * does now, and the website's bell has always opened history rather than a
 * live check, so this is where the two line up.
 *
 * The hazard check loses nothing by sitting behind a card here: HomeScreen
 * keeps its own direct button, which is the one a farmer reaches for when the
 * sky looks wrong. The check is still only ever run on a tap, never on mount,
 * so arriving here costs no CAP fetch.
 */
export default function AlertsRoute() {
  const { t } = useT();
  const [farmerId, setFarmerId] = useState<string | null>(null);
  const [hazardOpen, setHazardOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void getDashboardData().then((d) => {
      if (alive) setFarmerId(d.farmer?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <SafeAreaView edges={["left", "right"]} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader title={t("notifications.title")} />

        <Pressable
          onPress={() => setHazardOpen(true)}
          accessibilityRole="button"
          style={[styles.hazardCard, cardShadow]}
        >
          <Ionicons name="shield-half" size={20} color={colors.danger} />
          {/* No subtitle: every hazardCheck.* string other than the button is
              about a check in progress or its result, and borrowing one here
              would promise something that has not run yet. */}
          <Text style={styles.hazardTitle}>{t("hazardCheck.button")}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>

        {farmerId && <NotificationInbox farmerId={farmerId} />}
      </ScrollView>

      {hazardOpen && <HazardCheckModal onClose={() => setHazardOpen(false)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: layout.screenX, paddingTop: layout.screenTop, gap: space.md, paddingBottom: layout.screenBottom },
  hazardCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.dangerSoft,
  },
  hazardTitle: { ...type.body, fontWeight: "700", color: colors.text, flex: 1 },
});
