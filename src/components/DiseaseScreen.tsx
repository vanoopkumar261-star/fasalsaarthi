import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  diagnoseLeaf,
  getRecentDiagnoses,
  historyCutoff,
  type DiagnosisRecord,
  type DiseaseResult,
} from "@/lib/disease";
import { getDashboardData } from "@/lib/dashboard";
import { getPlanState } from "@/lib/plan";
import { planOf } from "@/lib/plans";
import { bodyFont, colors, layout, radius, space, tabularNums, type, themed } from "@/theme";
import { useT } from "./i18n/LanguageProvider";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { EmptyState } from "./ui/EmptyState";
import { HeroCard } from "./ui/HeroCard";
import { PillTabs } from "./ui/PillTabs";
import { Badge, ErrorState, SectionHeader } from "./ui/Primitives";
import { useScreenDescriber } from "@/lib/agent/screenRegistry";
import { usePendingIntent } from "@/lib/agent/intents";
import { useVoiceAgent } from "@/components/agent/VoiceAgent";

const SEVERITY_TONE: Record<DiseaseResult["severity"], "green" | "mustard" | "critical"> = {
  Low: "green",
  Medium: "mustard",
  High: "critical",
};

/** Below this the model is guessing, and the farmer is told so before spending money. */
const UNCERTAIN_BELOW = 0.7;

export function DiseaseScreen() {
  const { t, locale } = useT();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiseaseResult | null>(null);
  const [permError, setPermError] = useState<string | null>(null);
  const [history, setHistory] = useState<DiagnosisRecord[]>([]);

  const { phase, narrate, offer } = useVoiceAgent();
  useScreenDescriber("/scan", () => {
    if (loading) return "Checking the leaf photo now.";
    if (!result) return "Leaf disease check. The farmer can take a photo of a sick leaf with the camera.";
    return result.healthy
      ? `The ${result.crop} leaf looks healthy.`
      : `Diagnosis: ${result.disease} on ${result.crop}, severity ${result.severity}, about ${result.affectedAreaPct}% of the leaf affected. ${result.summary} ` +
          `Organic treatment: ${result.treatment.organic.slice(0, 2).join("; ")}. Chemical: ${result.treatment.chemical.slice(0, 2).join("; ")}.`;
  });

  // "Scan my leaf" by voice opens the camera straight away...
  const voiceScan = usePendingIntent<{ camera: boolean }>("scan");
  useEffect(() => {
    if (voiceScan?.camera) pick(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceScan]);

  // History, refreshed after every scan so a new result appears in the list
  // without the farmer having to leave and come back.
  const loadHistory = useCallback(async () => {
    const dash = await getDashboardData().catch(() => null);
    const farmerId = dash?.farmer?.id;
    if (!farmerId) return;
    const state = await getPlanState();
    const since = historyCutoff(planOf(state?.plan));
    setHistory(await getRecentDiagnoses(farmerId, 8, since));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHistory();
  }, [loadHistory, result]);

  // ...and when a fresh diagnosis arrives, the assistant OFFERS to explain it
  // rather than reciting the whole thing unprompted — the full read-out
  // (narrate) happens only if the farmer says yes. Skipped when muted or on an
  // error result, where there is nothing to explain.
  useEffect(() => {
    if (!result || result.error || phase === "off") return;
    const question = result.healthy
      ? t("agent.diseaseOfferHealthy")
      : t("agent.diseaseOfferSick", { disease: result.disease ?? "", crop: result.crop ?? "" });
    offer(question, narrate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  async function pick(fromCamera: boolean) {
    setPermError(null);
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      // Previously this returned silently, so denying the permission looked
      // exactly like the button not working.
      setPermError(t("photo.permissionDenied"));
      return;
    }

    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true, mediaTypes: ["images"] });

    if (res.canceled || !res.assets?.[0]) return;
    const uri = res.assets[0].uri;
    setPhotoUri(uri);
    setResult(null);
    setLoading(true);
    setResult(await diagnoseLeaf(uri));
    setLoading(false);
  }

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={[styles.subtitle, { fontFamily: bodyFont(locale) }]}>{t("disease.subtitle")}</Text>

      <View style={styles.actionRow}>
        <Button label={t("photo.take")} icon="camera-outline" onPress={() => pick(true)} style={styles.grow} />
        <Button
          label={t("photo.gallery")}
          icon="image-outline"
          variant="secondary"
          onPress={() => pick(false)}
          style={styles.grow}
        />
      </View>

      {permError && <ErrorState message={permError} />}

      {photoUri && (
        <Card flush style={styles.previewCard}>
          <Image
            source={{ uri: photoUri }}
            style={styles.preview}
            resizeMode="cover"
            accessibilityLabel={t("disease.leafPhotoAlt")}
          />
        </Card>
      )}

      {loading && (
        <Card style={styles.busy}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.busyText, { fontFamily: bodyFont(locale) }]}>{t("diseaseScanner.analyzing")}</Text>
        </Card>
      )}

      {result?.error && <ErrorState message={result.error} onRetry={() => pick(true)} retryLabel={t("photo.take")} />}

      {result && !result.error && <ResultCard result={result} />}

      {!photoUri && !loading && !result && (
        <EmptyState icon="leaf-outline" title={t("hub.scan")} body={t("diseaseScanner.uploadSubtitle")} />
      )}

      {/* Past scans. These were always being saved — /api/disease writes them
          against the Bearer token and they have shown on the web dashboard all
          along — but never read back here, so a farmer could photograph the
          same leaf twice and never see what they were told the first time. */}
      {history.length > 0 && (
        <View style={styles.history}>
          <Text style={[styles.historyTitle, { fontFamily: bodyFont(locale, "semi") }]}>
            {t("disease.recentScans")}
          </Text>
          {history.map((h) => (
            <View key={h.id} style={styles.historyRow}>
              <View
                style={[
                  styles.historyDot,
                  { backgroundColor: h.healthy ? colors.optimal : colors.critical },
                ]}
              />
              <View style={styles.historyBody}>
                <Text style={[styles.historyName, { fontFamily: bodyFont(locale, "semi") }]}>
                  {h.healthy ? t("disease.healthy") : (h.disease ?? "—")}
                </Text>
                <Text style={[styles.historyMeta, { fontFamily: bodyFont(locale) }]}>
                  {[h.crop_name, new Date(h.created_at).toLocaleDateString("en-IN")]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ResultCard({ result }: { result: DiseaseResult }) {
  const { t, locale } = useT();
  const hasOrganic = result.treatment.organic.length > 0;
  const hasChemical = result.treatment.chemical.length > 0;
  const [tab, setTab] = useState<"organic" | "chemical">(hasOrganic ? "organic" : "chemical");

  const confPct = Math.round(result.confidence * 100);
  const uncertain = result.confidence < UNCERTAIN_BELOW;
  const steps = tab === "organic" ? result.treatment.organic : result.treatment.chemical;

  return (
    <>
      <HeroCard
        eyebrow={t("diseaseScanner.confidence").toUpperCase()}
        title={result.healthy ? t("disease.noDiseaseFound") : `${result.crop} · ${result.disease}`}
        meta={result.summary}
        badge={t("diseaseScanner.severitySuffix", { severity: result.severity })}
        icon="scan-outline"
        tone={SEVERITY_TONE[result.severity]}
        progressPct={confPct}
      >
        <Text style={[styles.heroMeta, { fontFamily: bodyFont(locale) }, tabularNums]}>
          {confPct}% ·{" "}
          {result.source === "model" ? t("diseaseScanner.trainedModel") : t("diseaseScanner.aiVision")}
        </Text>
        {result.note ? (
          <Text style={[styles.heroNote, { fontFamily: bodyFont(locale) }]}>{result.note}</Text>
        ) : null}
      </HeroCard>

      {/* §17: a low-confidence guess must say so BEFORE the treatment list, not
          after it — the farmer is about to spend money on the strength of it. */}
      {uncertain && (
        <Card tone="danger" style={styles.warn}>
          <View style={styles.warnRow}>
            <MaterialCommunityIcons name="alert-outline" size={20} color={colors.danger} />
            <Text style={[styles.warnText, { fontFamily: bodyFont(locale, "semi") }]}>
              {t("diseaseScanner.uncertainDiagnosis", { conf: confPct })}
            </Text>
          </View>
          <Text style={[styles.warnBody, { fontFamily: bodyFont(locale) }]}>
            {t("diseaseScanner.confirmOfficer")}
          </Text>
        </Card>
      )}

      {(hasOrganic || hasChemical) && (
        <Card>
          <SectionHeader title={t("diseaseScanner.organic") + " / " + t("diseaseScanner.chemical")} icon="medical-bag" />
          {hasOrganic && hasChemical ? (
            <PillTabs
              tabs={[
                { key: "organic", label: t("diseaseScanner.organic") },
                { key: "chemical", label: t("diseaseScanner.chemical") },
              ]}
              value={tab}
              onChange={setTab}
            />
          ) : null}

          {steps.map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepNum}>
                <Text style={[styles.stepNumText, tabularNums, { fontFamily: bodyFont(locale, "semi") }]}>
                  {i + 1}
                </Text>
              </View>
              <Text style={[styles.stepText, { fontFamily: bodyFont(locale) }]}>{step}</Text>
            </View>
          ))}

          <View style={styles.recovery}>
            <Badge label={`${t("diseaseScanner.recovery")}: ${result.recovery}`} tone="positive" icon="clock-outline" />
          </View>
        </Card>
      )}

      {result.prevention.length > 0 && (
        <Card>
          <SectionHeader title={t("diseaseScanner.prevention")} icon="shield-check-outline" />
          {result.prevention.map((p, i) => (
            <View key={i} style={styles.bullet}>
              <MaterialCommunityIcons name="check-circle-outline" size={16} color={colors.optimal} />
              <Text style={[styles.bulletText, { fontFamily: bodyFont(locale) }]}>{p}</Text>
            </View>
          ))}
        </Card>
      )}

      <Text style={[styles.disclaimer, { fontFamily: bodyFont(locale) }]}>{t("diseaseScanner.disclaimer")}</Text>
    </>
  );
}

const styles = themed(() => StyleSheet.create({
  history: { gap: space.xs, marginTop: space.sm },
  historyTitle: { ...type.card, color: colors.text, fontWeight: "800" },
  historyRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  historyDot: { width: 8, height: 8, borderRadius: 4 },
  historyBody: { flex: 1, minWidth: 0 },
  historyName: { ...type.secondary, color: colors.text },
  historyMeta: { ...type.meta, color: colors.textMuted },

  container: {
    paddingHorizontal: layout.screenX,
    paddingBottom: layout.screenBottom,
    gap: layout.cardGap,
  },
  subtitle: { ...type.body, color: colors.textSecondary },

  actionRow: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },

  previewCard: { overflow: "hidden" },
  preview: { width: "100%", height: 220, backgroundColor: colors.bgSunken },

  busy: { alignItems: "center", gap: space.xs },
  busyText: { ...type.body, color: colors.textSecondary },

  heroMeta: { ...type.secondary, color: "rgba(255,255,255,0.85)", marginTop: 4 },
  heroNote: { ...type.secondary, color: "rgba(255,255,255,0.8)", fontStyle: "italic", marginTop: 4 },

  warn: { gap: space.xs },
  warnRow: { flexDirection: "row", alignItems: "flex-start", gap: space.xs },
  warnText: { ...type.body, color: colors.danger, flex: 1 },
  warnBody: { ...type.secondary, color: colors.textSecondary },

  step: { flexDirection: "row", gap: space.sm, alignItems: "flex-start", paddingTop: space.xxs },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { ...type.secondary, color: colors.goldInk },
  stepText: { ...type.body, color: colors.textSecondary, flex: 1 },

  recovery: { paddingTop: space.xxs },

  bullet: { flexDirection: "row", gap: space.xs, alignItems: "flex-start" },
  bulletText: { ...type.body, color: colors.textSecondary, flex: 1 },

  disclaimer: { ...type.meta, color: colors.textMuted, paddingHorizontal: space.xxs, lineHeight: 17 },
}));
