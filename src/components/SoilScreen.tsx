import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { getDashboardData, type DashboardData } from "@/lib/dashboard";
import { listReadings, rangeForCrop, readPhFromPhoto, saveReading, type PhReading } from "@/lib/soil";
import { phBand } from "@/lib/soilPh";
import { bodyFont, cardShadow, colors, displayFont, eyebrow, layout, radius, space, tabularNums, type, themed } from "@/theme";
import { useT } from "./i18n/LanguageProvider";
import { EmptyState } from "./ui/EmptyState";
import { SoilCropFit } from "./SoilCropFit";
import { SoilPhFix } from "./SoilPhFix";
import { useScreenDescriber } from "@/lib/agent/screenRegistry";
import { usePendingIntent } from "@/lib/agent/intents";

const SCALE_MIN = 4;
const SCALE_MAX = 10;

/**
 * Soil pH — the one dashboard feature the mobile app never had.
 *
 * The scale runs 4–10 rather than 0–14 because no agricultural soil sits
 * outside it, and stretching the useful range across the whole bar is what
 * makes a 0.2 shift visible to the eye.
 */
export function SoilScreen() {
  const { t, locale } = useT();
  const [data, setData] = useState<DashboardData | null>(null);
  const [readings, setReadings] = useState<PhReading[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ ph: number; confidence: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const dash = await getDashboardData();
      setData(dash);
      if (dash.farmer?.id) setReadings(await listReadings(dash.farmer.id));
    } catch {
      setError(t("soilPh.networkError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const latest = pending?.ph ?? readings[0]?.ph ?? null;
  const farms = data?.farms ?? [];
  /**
   * Advice reads the SAVED pH, never `latest` — which folds in `pending`, a
   * number the model read off a photo and the farmer has not confirmed yet.
   * A misread meter must not be able to recommend buying lime.
   */
  const savedPh = readings[0]?.ph ?? null;
  const fallowFarms = farms.filter((f) => !f.crop);
  const crop = data?.farms?.find((f) => f.crop)?.crop?.chosen_crop ?? null;
  const [lo, hi] = rangeForCrop(crop);
  const inRange = latest != null && latest >= lo && latest <= hi;
  const band = phBand(latest ?? 7);

  /*
    read_soil_meter lands the farmer here and opens the camera for them, the
    same way scan_leaf does on the disease screen (see DiseaseScreen's "scan"
    intent, which this mirrors deliberately). Without it the tool could only
    get them to the screen, and a hands-free agent that still needs a tap has
    not done the job.
  */
  const voiceMeter = usePendingIntent<{ camera: boolean }>("soil");
  useEffect(() => {
    if (voiceMeter?.camera) capture("camera");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceMeter]);

  async function capture(from: "camera" | "library") {
    setError(null);
    const perm =
      from === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(t("photo.permissionDenied"));
      return;
    }
    const res =
      from === "camera"
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (res.canceled || !res.assets?.[0]?.uri) return;

    setBusy(true);
    const out = await readPhFromPhoto(res.assets[0].uri);
    setBusy(false);
    if (out.error || out.ph == null) {
      setError(out.error ?? t("soilPh.couldNotRead"));
      return;
    }
    setPending({ ph: out.ph, confidence: out.confidence });
  }

  async function confirm() {
    if (!pending || !data?.farmer?.id) return;
    setBusy(true);
    const ok = await saveReading({
      farmerId: data.farmer.id,
      farmId: data.farms?.[0]?.id ?? null,
      ph: pending.ph,
      source: "photo",
      confidence: pending.confidence,
    });
    setBusy(false);
    if (!ok) {
      setError(t("soilPh.saveError"));
      return;
    }
    setPending(null);
    setReadings(await listReadings(data.farmer.id));
  }

  useScreenDescriber("/soil", () => {
    if (loading) return "";
    const last = readings[0];
    return last
      ? `Latest soil pH reading: ${last.ph} on ${last.created_at.slice(0, 10)}. ${readings.length} readings saved. The farmer can take a photo of a pH strip to add one.`
      : "No soil pH readings yet. The farmer can take a photo of a pH test strip to record one.";
  });

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={[styles.card, cardShadow]}>
        <Text style={[eyebrow, styles.kicker, { fontFamily: bodyFont(locale, "semi") }]}>
          {t("soilPh.cardTitle")}
        </Text>

        {latest == null ? (
          <EmptyState icon="flask-outline" title={t("soilPh.emptyCard")} body={t("soilPh.subtitle")} />
        ) : (
          <>
            <View style={styles.valueRow}>
              <Text style={[styles.value, tabularNums, { fontFamily: displayFont(locale) }]}>
                {latest.toFixed(1)}
              </Text>
              <Text style={[styles.unit, { fontFamily: bodyFont(locale, "semi") }]}>pH</Text>
            </View>

            <PhScale value={latest} lo={lo} hi={hi} />

            <View style={[styles.verdict, { backgroundColor: inRange ? colors.surfaceSoft : colors.dangerSoft }]}>
              <View style={styles.verdictHead}>
                <MaterialCommunityIcons
                  name={inRange ? "check-circle-outline" : "alert-circle-outline"}
                  size={18}
                  color={inRange ? colors.optimal : colors.danger}
                />
                <Text style={[styles.verdictText, { fontFamily: bodyFont(locale, "semi") }]}>
                  {t(`soilPh.band.${band.key}.label`)}
                </Text>
                {crop ? (
                  <Text style={[styles.range, tabularNums, { fontFamily: bodyFont(locale) }]}>
                    {crop} {lo.toFixed(1)}–{hi.toFixed(1)}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.verdictAdvice, { fontFamily: bodyFont(locale) }]}>
                {t(`soilPh.band.${band.key}.advice`)}
              </Text>
            </View>
          </>
        )}
      </View>

      {pending && (
        <View style={[styles.card, styles.pendingCard, cardShadow]}>
          <Text style={[styles.pendingTitle, { fontFamily: bodyFont(locale, "semi") }]}>
            {t("soilPh.confirmValue")}
          </Text>
          <Text style={[styles.pendingBody, { fontFamily: bodyFont(locale) }]}>{t("soilPh.caveat")}</Text>
          <View style={styles.pendingActions}>
            <Pressable onPress={() => setPending(null)} style={[styles.btn, styles.btnGhost]}>
              <Text style={[styles.btnGhostText, { fontFamily: bodyFont(locale, "semi") }]}>
                {t("soilPh.discard")}
              </Text>
            </Pressable>
            <Pressable onPress={confirm} disabled={busy} style={[styles.btn, styles.btnPrimary]}>
              <Text style={[styles.btnPrimaryText, { fontFamily: bodyFont(locale, "semi") }]}>
                {t("soilPh.save")}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={[styles.card, cardShadow]}>
        <View style={styles.readRow}>
          <MaterialCommunityIcons name="camera-outline" size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.readTitle, { fontFamily: bodyFont(locale, "semi") }]}>
              {t("soilPh.uploadTitle")}
            </Text>
            <Text style={[styles.readBody, { fontFamily: bodyFont(locale) }]}>{t("soilPh.uploadHint")}</Text>
          </View>
        </View>
        <View style={styles.captureRow}>
          <Pressable onPress={() => capture("camera")} disabled={busy} style={[styles.btn, styles.btnPrimary, styles.grow]}>
            {busy ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={[styles.btnPrimaryText, { fontFamily: bodyFont(locale, "semi") }]}>
                {t("photo.take")}
              </Text>
            )}
          </Pressable>
          <Pressable onPress={() => capture("library")} disabled={busy} style={[styles.btn, styles.btnOutline, styles.grow]}>
            <Text style={[styles.btnOutlineText, { fontFamily: bodyFont(locale, "semi") }]}>
              {t("photo.gallery")}
            </Text>
          </Pressable>
        </View>
        {error && (
          <View style={styles.errorRow}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={[styles.errorText, { fontFamily: bodyFont(locale) }]}>{error}</Text>
          </View>
        )}
      </View>

      {readings.length > 0 && (
        <View style={[styles.card, cardShadow]}>
          <Text style={[eyebrow, styles.kicker, { fontFamily: bodyFont(locale, "semi") }]}>
            {t("soilPh.history")}
          </Text>
          {readings.map((r, i) => (
            <View key={r.id} style={[styles.historyRow, i > 0 && styles.divider]}>
              <Text style={[styles.historyDate, { fontFamily: bodyFont(locale) }]}>
                {new Date(r.created_at).toLocaleDateString()}
              </Text>
              <Text style={[styles.historyPh, tabularNums, { fontFamily: bodyFont(locale, "semi") }]}>
                {r.ph.toFixed(1)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* What to do about the pH, for the crop that is actually growing. The
          farm objects already carry their cycle, so nothing needs re-fetching. */}
      {savedPh != null && farms.length > 0 && <SoilPhFix ph={savedPh} farms={farms} />}

      {/* "Which crops suit this pH" is the wrong question for a standing crop
          and the right one for bare ground, so it survives only for farms with
          no cycle. */}
      {savedPh != null && data?.farmer && fallowFarms.length > 0 && (
        <SoilCropFit
          address={data.farmer.house_address ?? ""}
          preferOilseed={data.farmer.preferences?.["oilseed_ack"] === true}
          latestPh={savedPh}
          farms={fallowFarms.map((f) => ({
            farm_index: f.farm_index,
            area: f.area,
            soilType: f.soil_type,
            irrigation: f.irrigation,
          }))}
        />
      )}
    </ScrollView>
  );
}

/** The acid→alkaline strip, with the crop's happy band marked on it. */
function PhScale({ value, lo, hi }: { value: number; lo: number; hi: number }) {
  const clamp = (v: number) => Math.max(SCALE_MIN, Math.min(SCALE_MAX, v));
  const pos = (v: number) => (clamp(v) - SCALE_MIN) / (SCALE_MAX - SCALE_MIN);

  return (
    <View style={styles.scaleWrap}>
      <Svg width="100%" height={18} style={styles.scaleBar}>
        <Defs>
          <LinearGradient id="ph" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.danger} />
            <Stop offset="0.35" stopColor={colors.accent} />
            <Stop offset="0.5" stopColor={colors.optimal} />
            <Stop offset="0.72" stopColor={colors.leaf} />
            <Stop offset="1" stopColor={colors.info} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="18" rx="9" fill="url(#ph)" />
      </Svg>

      <View style={[styles.marker, { left: `${pos(value) * 100}%` }]} />

      <View style={styles.scaleLabels}>
        <Text style={styles.scaleTick}>{SCALE_MIN}</Text>
        <Text style={styles.scaleTick}>7</Text>
        <Text style={styles.scaleTick}>{SCALE_MAX}</Text>
      </View>
      <View style={[styles.band, { left: `${pos(lo) * 100}%`, width: `${(pos(hi) - pos(lo)) * 100}%` }]} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: {
    paddingHorizontal: layout.screenX,
    paddingBottom: layout.screenBottom,
    gap: layout.cardGap,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: layout.cardPadding,
    gap: space.sm,
  },
  kicker: { color: colors.leaf },
  valueRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  value: { fontSize: 44, lineHeight: 50, color: colors.text, fontWeight: "700" },
  unit: { ...type.section, color: colors.textMuted, paddingBottom: 8 },

  scaleWrap: { paddingTop: space.xs, paddingBottom: space.lg },
  scaleBar: { borderRadius: 9 },
  marker: {
    position: "absolute",
    top: space.xs - 4,
    marginLeft: -13,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  band: {
    position: "absolute",
    top: space.xs + 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  scaleLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  scaleTick: { ...type.meta, color: colors.textMuted },

  verdict: { gap: 6, padding: space.sm, borderRadius: radius.sm },
  verdictHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  verdictAdvice: { ...type.secondary, color: colors.textSecondary },
  verdictText: { ...type.body, color: colors.text, flex: 1 },
  range: { ...type.secondary, color: colors.textMuted },

  pendingCard: { borderColor: colors.accent, borderWidth: 2 },
  pendingTitle: { ...type.section, color: colors.text },
  pendingBody: { ...type.body, color: colors.textSecondary },
  pendingActions: { flexDirection: "row", gap: space.sm },

  readRow: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  readTitle: { ...type.card, color: colors.text },
  readBody: { ...type.secondary, color: colors.textMuted },
  captureRow: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },

  btn: {
    minHeight: layout.touchTarget + 4,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { ...type.body, color: colors.onPrimary },
  btnOutline: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  btnOutlineText: { ...type.body, color: colors.primary },
  btnGhost: { flex: 1, backgroundColor: colors.surfaceSoft },
  btnGhostText: { ...type.body, color: colors.primary },

  errorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  errorText: { ...type.secondary, color: colors.danger, flex: 1 },

  historyRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: space.sm },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  historyDate: { ...type.body, color: colors.textSecondary },
  historyPh: { ...type.body, color: colors.text },
}));
