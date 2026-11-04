import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { cardShadow, colors, eyebrow, radius, space, type } from "@/theme";
import { fetchRecommendations, type CropRec } from "@/lib/onboarding";
import { phBand } from "@/lib/soilPh";
import { useT } from "./i18n/LanguageProvider";

export type FitFarm = {
  farm_index: number;
  area: number;
  soilType: string;
  irrigation: string;
};

/**
 * "Which crops suit this pH" — asked only of bare ground.
 *
 * The web app learned to be careful with this question: for a farmer ninety
 * days into wheat it is useless and faintly insulting, which is why
 * SoilPhFix exists and why this survives only for farms with no crop cycle.
 * The caller is responsible for that filter; this component trusts it.
 *
 * It is behind a button rather than fetched on mount because it costs a model
 * call, and a farmer who opened the soil screen to read their pH has not
 * asked for crop advice.
 */
export function SoilCropFit({
  address,
  preferOilseed,
  latestPh,
  farms,
}: {
  address: string;
  preferOilseed: boolean;
  latestPh: number;
  farms: FitFarm[];
}) {
  const { t } = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CropRec[][] | null>(null);
  const band = phBand(latestPh);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRecommendations({
        locationAddress: address,
        preferOilseed,
        farms: farms.map((f) => ({
          area: f.area,
          soilType: f.soilType,
          irrigation: f.irrigation,
          soilPh: latestPh,
        })),
      });
      setResult(data);
    } catch {
      setError(t("soilPh.cropFitError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.wrap}>
      {!result && (
        <Pressable
          onPress={run}
          disabled={loading}
          accessibilityRole="button"
          style={[styles.button, loading && styles.buttonBusy]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="leaf-outline" size={16} color={colors.primary} />
          )}
          <Text style={styles.buttonText}>
            {loading ? t("soilPh.cropFitLoading") : t("soilPh.cropFitButton")}
          </Text>
        </Pressable>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {result && (
        <View style={{ gap: space.sm }}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>
              {t("soilPh.cropFitTitle", { ph: latestPh.toFixed(1) })}
            </Text>
            <Text style={[styles.bandLabel, { color: band.color }]}>
              {t(`soilPh.band.${band.key}.label`)}
            </Text>
          </View>

          {result.map((farmRecs, fi) => (
            <View key={fi} style={[styles.card, cardShadow]}>
              <Text style={styles.farmLabel}>Farm {farms[fi]?.farm_index ?? fi + 1}</Text>
              {farmRecs.slice(0, 3).map((rec, i) => (
                <View key={i} style={[styles.recRow, i > 0 && styles.divider]}>
                  <Ionicons
                    name="chevron-forward"
                    size={15}
                    color={colors.primary}
                    style={{ marginTop: 3 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recName}>
                      {rec.cropName}
                      <Text style={styles.recMeta}>
                        {"  "}
                        {rec.suitabilityScore}/100 · {rec.riskScore} risk
                      </Text>
                    </Text>
                    {rec.pros?.[0] ? (
                      <Text style={styles.recReason} numberOfLines={2}>
                        {rec.pros[0]}
                        {rec.cons?.[0] ? ` — ${rec.cons[0]}` : ""}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.lg, gap: space.sm },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    height: 48,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  buttonBusy: { opacity: 0.7 },
  buttonText: { ...type.body, fontWeight: "700", color: colors.text },
  error: { ...type.secondary, color: colors.danger },
  titleRow: { flexDirection: "row", alignItems: "baseline", gap: space.xs, flexWrap: "wrap" },
  title: { ...type.card, fontWeight: "700", color: colors.text },
  bandLabel: { ...type.meta },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: space.md },
  farmLabel: { ...eyebrow, color: colors.textMuted, marginBottom: space.xs },
  recRow: { flexDirection: "row", gap: space.xs, paddingVertical: space.xs + 2 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  recName: { ...type.body, fontWeight: "700", color: colors.text },
  recMeta: { ...type.meta, fontWeight: "400", color: colors.textMuted },
  recReason: { ...type.meta, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
});
