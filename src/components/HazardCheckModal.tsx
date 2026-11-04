import { useCallback, useEffect, useState } from "react";
import { colors as tokens, themed } from "@/theme";
import { ActivityIndicator, Linking, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/constants/colors";
import { useT } from "./i18n/LanguageProvider";
import { checkHazards, istTime, type HazardCheck, type MatchedAlert } from "@/lib/hazards";

/**
 * t("hazardCheck.title") — the mobile half.
 *
 * Mirrors the web dashboard's popup and calls the same endpoint, so the two
 * cannot give the same farmer different answers about the same storm.
 *
 * Two rules, same as the web:
 *  1. The app is never the authority. Every warning names the agency that
 *     issued it and quotes that agency's instruction word for word. Nothing is
 *     paraphrased or translated — a machine-translated government safety
 *     instruction is worse than none at all.
 *  2. t("hazardCheck.noneTitle") is a real answer and gets a confident panel, not a
 *     grey empty state that reads like the screen failed to load.
 */

const BAND_STYLE: Record<
  MatchedAlert["band"],
  { bg: string; border: string; chipBg: string; chipText: string; icon: keyof typeof Ionicons.glyphMap; iconColor: string; label: string }
> = themed(() => ({
  red: {
    bg: tokens.severityRedBg,
    border: tokens.severityRedBorder,
    chipBg: colors.danger,
    chipText: "#FFFFFF",
    icon: "alert-circle",
    iconColor: colors.danger,
    label: "RED",
  },
  orange: {
    bg: tokens.severityAmberBg,
    border: tokens.severityAmberBorder,
    chipBg: colors.amber,
    chipText: colors.amberInk,
    icon: "warning",
    iconColor: colors.amberInk,
    label: "ORANGE",
  },
  yellow: {
    bg: colors.bg,
    border: colors.sageLine,
    chipBg: colors.sage,
    chipText: colors.textSoft,
    icon: "information-circle",
    iconColor: colors.textFaint,
    label: "YELLOW",
  },
}));

function AlertBlock({ alert }: { alert: MatchedAlert }) {
  const { t } = useT();
  const s = BAND_STYLE[alert.band];
  return (
    <View style={[styles.alertCard, { backgroundColor: s.bg, borderColor: s.border }]}>
      <View style={styles.alertHead}>
        <Ionicons name={s.icon} size={17} color={s.iconColor} style={{ marginTop: 1 }} />
        <Text style={styles.alertEvent}>{alert.event}</Text>
        <View style={[styles.chip, { backgroundColor: s.chipBg }]}>
          <Text style={[styles.chipText, { color: s.chipText }]}>{s.label}</Text>
        </View>
      </View>

      {/* Verbatim. Never rewritten, never translated. */}
      <Text style={styles.alertHeadline}>{alert.headline}</Text>

      {alert.instruction ? (
        <View style={styles.instructionBox}>
          <Text style={styles.instructionLabel}>{t("hazardCheck.instruction")}</Text>
          <Text style={styles.instructionText}>{alert.instruction}</Text>
        </View>
      ) : null}

      <View style={styles.metaRow}>
        {alert.sender ? (
          <Text style={styles.meta}>{t("hazardCheck.issuedBy", { sender: alert.sender })}</Text>
        ) : null}
        <Text style={styles.meta}>{t("hazardCheck.validUntil", { time: istTime(alert.expires) })}</Text>
      </View>
    </View>
  );
}

function Section({
  title,
  alerts,
  emphasised,
}: {
  title: string;
  alerts: MatchedAlert[];
  emphasised?: boolean;
}) {
  if (alerts.length === 0) return null;
  return (
    <View style={emphasised ? styles.emergencyWrap : undefined}>
      <Text style={[styles.sectionLabel, emphasised && styles.sectionLabelRed]}>{title}</Text>
      {alerts.map((a, i) => (
        <AlertBlock key={i} alert={a} />
      ))}
    </View>
  );
}

export default function HazardCheckModal({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [result, setResult] = useState<HazardCheck | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const r = await checkHazards();
    if (r) setResult(r);
    else setFailed(true);
    setLoading(false);
  }, []);

  // The farmer already asked by opening this — don't make them tap again.
  useEffect(() => {
    run();
  }, [run]);

  const high = (result?.red.length ?? 0) + (result?.orange.length ?? 0);
  const allClear = result && !result.reason && high === 0;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t("hazardCheck.title")}</Text>
              {result?.district ? (
                <Text style={styles.subtitle}>Checked for {result.district}</Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t("hazardCheck.close")}>
              <Ionicons name="close" size={22} color={colors.textSoft} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {loading ? (
              <View style={styles.centred}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.searching}>
                  {result?.district
                    ? `Checking official warnings for ${result.district}…`
                    : t("hazardCheck.searchingGeneric")}
                </Text>
              </View>
            ) : null}

            {!loading && failed ? (
              <View style={styles.centred}>
                <Text style={styles.searching}>{t("hazardCheck.error")}</Text>
                <Pressable onPress={run} style={styles.retry}>
                  <Text style={styles.retryText}>{t("hazardCheck.retry")}</Text>
                </Pressable>
              </View>
            ) : null}

            {!loading && !failed && result?.reason === "no-location" ? (
              <View style={styles.infoPanel}>
                <Ionicons name="location-outline" size={24} color={colors.textFaint} />
                <Text style={styles.panelTitle}>{t("hazardCheck.noLocationTitle")}</Text>
                <Text style={styles.panelBody}>
                  Add your house location so we can check warnings for your district.
                </Text>
              </View>
            ) : null}

            {!loading && !failed && result && !result.reason ? (
              <>
                {allClear ? (
                  <View style={styles.clearPanel}>
                    <Ionicons name="checkmark-circle" size={28} color={colors.leaf} />
                    <Text style={styles.panelTitle}>
                      No emergency or high alerts raised in your location
                    </Text>
                    <Text style={styles.panelBody}>{t("hazardCheck.noneBody")}</Text>
                  </View>
                ) : null}

                <Section title="EMERGENCY — ACT NOW" alerts={result.red} emphasised />
                <Section title="HIGH ALERT — BE PREPARED" alerts={result.orange} />
                <Section title="ADVISORIES — BE AWARE" alerts={result.yellow} />

                <Text style={styles.disclaimer}>
                  Official warnings from government agencies, for your registered location. Always
                  follow local authority instructions.
                </Text>
                <View style={styles.footerRow}>
                  <Text style={styles.meta}>
                    Current as of {istTime(result.dataAsOf ?? result.checkedAt)}
                  </Text>
                  <Pressable onPress={() => Linking.openURL("https://sachet.ndma.gov.in/")}>
                    <Text style={styles.link}>NDMA SACHET</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.sageLine,
  },
  title: { fontSize: 16, fontWeight: "700", color: colors.ink },
  subtitle: { fontSize: 12, color: colors.textFaint, marginTop: 3 },
  body: { padding: 20, gap: 14 },
  centred: { alignItems: "center", gap: 10, paddingVertical: 40 },
  searching: { fontSize: 13, color: colors.textSoft, textAlign: "center" },
  retry: {
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  retryText: { fontSize: 13, fontWeight: "600", color: colors.ink },

  clearPanel: {
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: tokens.severityClearBorder,
    backgroundColor: tokens.severityClearBg,
    borderRadius: 16,
    padding: 20,
  },
  infoPanel: {
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.sageLine,
    backgroundColor: colors.bg,
    borderRadius: 16,
    padding: 20,
  },
  panelTitle: { fontSize: 15, fontWeight: "700", color: colors.ink, textAlign: "center" },
  panelBody: { fontSize: 13, color: colors.textSoft, textAlign: "center" },

  emergencyWrap: {
    borderWidth: 2,
    borderColor: tokens.severityRedBorder,
    backgroundColor: tokens.severityRedBg,
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: colors.textFaint,
    marginBottom: 8,
  },
  sectionLabelRed: { color: colors.danger },

  alertCard: { borderWidth: 1, borderRadius: 16, padding: 13, marginBottom: 10 },
  alertHead: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  alertEvent: { fontSize: 13, fontWeight: "700", color: colors.ink },
  chip: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  chipText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.8 },
  alertHeadline: { fontSize: 13, color: colors.textSoft, marginTop: 7, lineHeight: 18 },
  instructionBox: {
    marginTop: 9,
    borderWidth: 1,
    borderColor: colors.sageLine,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  instructionLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 1.2, color: colors.textFaint },
  instructionText: { fontSize: 12, color: colors.ink, marginTop: 3, lineHeight: 17 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 9 },
  meta: { fontSize: 12, color: colors.textFaint },

  disclaimer: { fontSize: 12, color: colors.textFaint, lineHeight: 16, marginTop: 4 },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  link: { fontSize: 12, fontWeight: "700", color: colors.leaf },
}));
