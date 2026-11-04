import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { cardShadow, colors, radius, space } from "@/theme";
import { CropFeasibilityNote } from "./CropFeasibilityNote";
import { useT } from "./i18n/LanguageProvider";
import { SoilPicker } from "./onboarding/SoilPicker";
import { ChipSelect, DateField, Field, TextField } from "./onboarding/fields";
import {
  createCropCycles,
  createFarms,
  effectiveCrop,
  fetchRecommendations,
  farmIrrigationLabel,
  makeFarm,
  makeSelection,
  SOIL_TYPES,
  type CropRec,
  type CropSelection,
  type FarmDraft,
} from "@/lib/onboarding";
import {
  IRRIGATION_METHODS,
  IRRIGATION_SOURCES,
  METHOD_EN,
  REGIME_EN,
  SOURCE_EN,
  WATER_REGIMES,
} from "@/lib/irrigationCatalog";
import { suggestHarvestDate } from "@/lib/agronomy";

/**
 * Adding a farm after registration.
 *
 * Until this existed the app could tell a farmer they had no farms and offer
 * no way to get one: HomeScreen's empty state read "add a farm to get
 * started" and nothing in the app could. Anyone who skipped the farms step in
 * onboarding — or who rents a new field next season — was stuck with a
 * read-only app and no route out of it but reinstalling.
 *
 * It deliberately reuses the onboarding pieces rather than restating them:
 * the same SoilPicker photographs, the same irrigation chips, the same
 * `/api/recommendations` call through `fetchRecommendations`, and the same
 * `createFarms`/`createCropCycles` writes. The web modal makes the identical
 * choice for the identical reason — a farmer who is told one thing about a
 * soil type during registration and something else afterwards has been given
 * two different apps.
 *
 * `createFarms` already continues `farm_index` from the farmer's existing
 * farms, so nothing here has to think about numbering; it was written that
 * way for this caller.
 */
export function AddFarmModal({
  visible,
  farmerId,
  locationAddress,
  onClose,
  onAdded,
}: {
  visible: boolean;
  farmerId: string;
  locationAddress: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { t } = useT();
  const [step, setStep] = useState<1 | 2>(1);
  const [farm, setFarm] = useState<FarmDraft>(makeFarm);
  const [selection, setSelection] = useState<CropSelection>(makeSelection);
  const [recs, setRecs] = useState<CropRec[]>([]);
  const [recNote, setRecNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const areaNum = Number(farm.area);
  const areaValid = Number.isFinite(areaNum) && areaNum > 0;
  // Irrigated farms must answer both halves: the method is what sets
  // application efficiency, so "irrigated, somehow" is not usable.
  const waterAnswered =
    farm.regime === "rainfed" || (farm.regime === "irrigated" && farm.source && farm.method);
  const canAnalyse = areaValid && Boolean(farm.soilType) && Boolean(waterAnswered);
  const chosenCrop = effectiveCrop(selection);
  const harvestInvalid =
    Boolean(selection.estimatedHarvestDate) &&
    selection.estimatedHarvestDate <= selection.seedingDate;

  function reset() {
    setStep(1);
    setFarm(makeFarm());
    setSelection(makeSelection());
    setRecs([]);
    setRecNote(null);
    setError(null);
    setBusy(false);
  }

  function close() {
    reset();
    onClose();
  }

  /**
   * The recommendation call is allowed to fail without blocking the farm.
   * A farmer who already knows what they are sowing does not need the engine
   * to agree, so a failure downgrades to a note and the custom-crop field,
   * exactly as the web modal does.
   */
  async function analyse() {
    setBusy(true);
    setError(null);
    setRecNote(null);
    try {
      const perFarm = await fetchRecommendations({
        locationAddress,
        farms: [{ area: areaNum, soilType: farm.soilType, irrigation: farmIrrigationLabel(farm) }],
      });
      const first = perFarm[0] ?? [];
      setRecs(first);
      if (first.length === 0) {
        setRecNote(`${t("addFarmModal.aiUnavailable")} ${t("addFarmModal.aiNoteSuffix")}`);
      }
    } catch {
      setRecs([]);
      setRecNote(`${t("addFarmModal.networkError")} ${t("addFarmModal.aiNoteSuffix")}`);
    } finally {
      setBusy(false);
      setStep(2);
    }
  }

  /** Keeps the harvest date in step with the crop until the farmer edits it. */
  function pickCrop(cropName: string) {
    setSelection((prev) => {
      const next: CropSelection = { ...prev, chosenCrop: cropName, customCrop: "" };
      if (!prev.harvestTouched && prev.seedingDate) {
        next.estimatedHarvestDate = suggestHarvestDate(cropName, prev.seedingDate);
      }
      return next;
    });
  }

  async function save() {
    if (!chosenCrop || harvestInvalid) return;
    setBusy(true);
    setError(null);
    try {
      const inserted = await createFarms(farmerId, [farm]);
      await createCropCycles(
        inserted.map((f: { id: string; area: number }) => ({ id: f.id, area: f.area })),
        [selection]
      );
      reset();
      onAdded();
    } catch {
      setError(t("addFarmModal.saveError"));
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{t("addFarmModal.title")}</Text>
            <Text style={styles.stepLabel}>
              {step === 1 ? t("addFarmModal.step1") : t("addFarmModal.step2")}
            </Text>
          </View>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={t("addFarmModal.close")}
            hitSlop={10}
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {step === 1 ? (
            <>
              <Text style={styles.intro}>{t("addFarmModal.fieldIntro")}</Text>

              <Field label={t("addFarmModal.farmArea")}>
                <TextField
                  value={farm.area}
                  onChangeText={(area) => setFarm((p) => ({ ...p, area }))}
                  placeholder={t("addFarmModal.areaPlaceholder")}
                  keyboardType="decimal-pad"
                />
              </Field>

              <Field label={t("addFarmModal.soilType")}>
                <SoilPicker
                  options={SOIL_TYPES}
                  value={farm.soilType}
                  onChange={(soilType) => setFarm((p) => ({ ...p, soilType }))}
                />
              </Field>

              {/*
                The same split question as registration — see
                irrigationCatalog.ts. A farm added here used to be recorded
                with half its water answer, exactly like one registered on the
                old onboarding form.
              */}
              <Field label={t("addFarmModal.irrigation")}>
                <ChipSelect
                  options={WATER_REGIMES}
                  value={farm.regime}
                  labelFor={(r) => REGIME_EN[r as keyof typeof REGIME_EN]}
                  onChange={(regime) =>
                    setFarm((p) => ({
                      ...p,
                      regime: regime as FarmDraft["regime"],
                      ...(regime === "rainfed" ? { source: "" as const, method: "" as const } : {}),
                    }))
                  }
                />
              </Field>

              {farm.regime === "irrigated" && (
                <>
                  <Field label="Water source">
                    <ChipSelect
                      options={IRRIGATION_SOURCES}
                      value={farm.source}
                      labelFor={(x) => SOURCE_EN[x as keyof typeof SOURCE_EN]}
                      onChange={(source) =>
                        setFarm((p) => ({ ...p, source: source as FarmDraft["source"] }))
                      }
                    />
                  </Field>

                  <Field label="How the water reaches the crop">
                    <ChipSelect
                      options={IRRIGATION_METHODS}
                      value={farm.method}
                      labelFor={(x) => METHOD_EN[x as keyof typeof METHOD_EN]}
                      onChange={(method) =>
                        setFarm((p) => ({ ...p, method: method as FarmDraft["method"] }))
                      }
                    />
                  </Field>
                </>
              )}
            </>
          ) : (
            <>
              <Text style={styles.summary}>
                {t("addFarmModal.summaryLine", {
                  soil: farm.soilType,
                  irrigation: farmIrrigationLabel(farm),
                  area: farm.area,
                })}
              </Text>

              {recNote ? <Text style={styles.note}>{recNote}</Text> : null}

              {recs.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>{t("addFarmModal.chooseCrop")}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.recRow}
                  >
                    {recs.map((rec) => {
                      const selected =
                        !selection.customCrop.trim() && selection.chosenCrop === rec.cropName;
                      return (
                        <Pressable
                          key={rec.cropName}
                          onPress={() => pickCrop(rec.cropName)}
                          style={[styles.recCard, cardShadow, selected && styles.recCardActive]}
                        >
                          <View style={styles.recHead}>
                            <Text style={styles.recName}>{rec.cropName}</Text>
                            {selected && (
                              <Ionicons
                                name="checkmark-circle"
                                size={20}
                                color={colors.primary}
                              />
                            )}
                          </View>
                          <Text style={styles.recMeta}>{rec.suitabilityScore}% fit</Text>
                          <Text style={styles.recMeta}>{rec.estimatedYield}</Text>
                          <Text style={styles.recMeta}>{rec.estimatedProfit}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              <Field label={t("addFarmModal.customCrop")} >
                <TextField
                  value={selection.customCrop}
                  onChangeText={(customCrop) =>
                    setSelection((p) => ({ ...p, customCrop }))
                  }
                  placeholder={t("addFarmModal.customCropPlaceholder")}
                  autoCapitalize="words"
                />
                {/* Same gate as registration: the field the farmer just
                    described, checked before the crop is committed to it. */}
                <CropFeasibilityNote
                  crop={selection.customCrop}
                  conditions={{
                    soilType: farm.soilType,
                    irrigation: farmIrrigationLabel(farm),
                  }}
                />
              </Field>
              <Text style={styles.hint}>{t("addFarmModal.customCropHint")}</Text>

              <Field label={t("addFarmModal.seedingDate")}>
                <DateField
                  value={selection.seedingDate}
                  onChange={(seedingDate) =>
                    setSelection((p) => ({
                      ...p,
                      seedingDate,
                      estimatedHarvestDate:
                        p.harvestTouched || !effectiveCrop(p)
                          ? p.estimatedHarvestDate
                          : suggestHarvestDate(effectiveCrop(p), seedingDate),
                    }))
                  }
                />
              </Field>

              <Field label={t("addFarmModal.estHarvestDate")}>
                <DateField
                  value={selection.estimatedHarvestDate}
                  onChange={(estimatedHarvestDate) =>
                    setSelection((p) => ({
                      ...p,
                      estimatedHarvestDate,
                      harvestTouched: true,
                    }))
                  }
                  minimumDate={
                    selection.seedingDate ? new Date(selection.seedingDate) : undefined
                  }
                />
              </Field>
              <Text style={styles.hint}>
                {selection.harvestTouched
                  ? t("addFarmModal.harvestHintCustom")
                  : t("addFarmModal.harvestHintSuggested")}
              </Text>

              {error ? <Text style={styles.error}>{error}</Text> : null}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step === 2 && (
            <Pressable
              onPress={() => setStep(1)}
              disabled={busy}
              style={[styles.btn, styles.btnGhost]}
            >
              <Text style={styles.btnGhostText}>{t("addFarmModal.back")}</Text>
            </Pressable>
          )}
          <Pressable
            onPress={step === 1 ? analyse : save}
            disabled={busy || (step === 1 ? !canAnalyse : !chosenCrop || harvestInvalid)}
            style={[
              styles.btn,
              styles.btnPrimary,
              (busy || (step === 1 ? !canAnalyse : !chosenCrop || harvestInvalid)) &&
                styles.btnDisabled,
            ]}
          >
            {busy ? (
              <View style={styles.btnBusy}>
                <ActivityIndicator size="small" color={colors.onPrimary} />
                <Text style={styles.btnPrimaryText}>
                  {step === 1 ? t("addFarmModal.analysing") : t("addFarmModal.addingFarm")}
                </Text>
              </View>
            ) : (
              <Text style={styles.btnPrimaryText}>
                {step === 1 ? t("addFarmModal.apply") : t("addFarmModal.title")}
              </Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  stepLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSoft,
  },
  body: { paddingHorizontal: space.md, paddingBottom: space.xl },
  intro: { fontSize: 13, color: colors.textSecondary, marginBottom: space.md },
  summary: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginBottom: space.sm,
  },
  note: {
    fontSize: 12.5,
    color: colors.goldInk,
    backgroundColor: colors.accentSoft,
    padding: space.sm,
    borderRadius: radius.card,
    marginBottom: space.md,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginBottom: space.xs,
  },
  recRow: { gap: space.sm, paddingBottom: space.md, paddingRight: space.md },
  recCard: {
    width: 150,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recCardActive: { borderColor: colors.primary, borderWidth: 2 },
  recHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recName: { fontSize: 14, fontWeight: "800", color: colors.text, flexShrink: 1 },
  recMeta: { fontSize: 11.5, color: colors.textSecondary, marginTop: 3 },
  hint: { fontSize: 11.5, color: colors.textMuted, marginTop: -space.xs, marginBottom: space.md },
  error: { fontSize: 13, color: colors.danger, marginTop: space.sm },
  footer: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  btn: {
    flex: 1,
    height: 50,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: colors.onPrimary, fontSize: 15, fontWeight: "800" },
  btnBusy: { flexDirection: "row", alignItems: "center", gap: space.xs },
  btnGhost: { backgroundColor: colors.surfaceSoft, flex: 0, paddingHorizontal: space.lg },
  btnGhostText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  btnDisabled: { opacity: 0.5 },
});
