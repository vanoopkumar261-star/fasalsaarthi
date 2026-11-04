import { colors as themeColors } from "@/theme/colors";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { colors as tokens, themed } from "@/theme";
import { Ionicons } from "@expo/vector-icons";

import { colors } from "@/constants/colors";
import { cardShadow } from "@/constants/effects";
import { farmIrrigationLabel, type CropRec, type CropSelection, type FarmDraft } from "@/lib/onboarding";
import { CropFeasibilityNote } from "../CropFeasibilityNote";
import { effectiveCrop } from "@/lib/onboarding";
import { DateField, Field, TextField } from "./fields";

type Props = {
  farms: FarmDraft[];
  recs: CropRec[][];
  selections: CropSelection[];
  onSelectionChange: (index: number, patch: Partial<CropSelection>) => void;
  termsAccepted: boolean;
  onTermsChange: (next: boolean) => void;
};

/**
 * Crop choice per farm, seeded by the AI recommendations.
 *
 * Unlike the web cards this shows suitability, yield and profit on the face of
 * the card rather than behind a "View guide" modal — the web version hides them
 * to keep a photo-led card scannable, and without the crop photography (a web
 * asset set) there is nothing here for that trade to buy.
 */
export function StepCrops({
  farms,
  recs,
  selections,
  onSelectionChange,
  termsAccepted,
  onTermsChange,
}: Props) {
  return (
    <View>
      {farms.map((farm, i) => {
        const sel = selections[i];
        const farmRecs = recs[i] ?? [];
        const chosen = effectiveCrop(sel);
        const harvestInvalid =
          Boolean(sel.estimatedHarvestDate) && sel.estimatedHarvestDate <= sel.seedingDate;

        return (
          <View key={i} style={styles.block}>
            <Text style={styles.farmTitle}>
              Farm {i + 1} · {farm.area || "—"} acres · {farm.soilType}
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recRow}
            >
              {farmRecs.map((rec) => {
                const selected = !sel.customCrop.trim() && sel.chosenCrop === rec.cropName;
                return (
                  <Pressable
                    key={rec.cropName}
                    onPress={() => onSelectionChange(i, { chosenCrop: rec.cropName, customCrop: "" })}
                    style={[styles.recCard, cardShadow, selected && styles.recCardActive]}
                  >
                    <View style={styles.recHead}>
                      <Text style={styles.recName}>{rec.cropName}</Text>
                      {selected && (
                        <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                      )}
                    </View>

                    <View style={styles.badgeRow}>
                      <View style={[styles.badge, riskStyle(rec.riskScore)]}>
                        <Text style={[styles.badgeText, riskTextStyle(rec.riskScore)]}>
                          {rec.riskScore} risk
                        </Text>
                      </View>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{rec.suitabilityScore}% fit</Text>
                      </View>
                    </View>

                    <Text style={styles.recMeta}>Yield · {rec.estimatedYield}</Text>
                    <Text style={styles.recMeta}>Profit · {rec.estimatedProfit}</Text>

                    {rec.pros.slice(0, 2).map((p) => (
                      <View key={p} style={styles.bulletRow}>
                        <Ionicons name="add-circle" size={13} color={colors.leaf} />
                        <Text style={styles.bullet}>{p}</Text>
                      </View>
                    ))}
                    {rec.cons.slice(0, 1).map((c) => (
                      <View key={c} style={styles.bulletRow}>
                        <Ionicons name="remove-circle" size={13} color={colors.amberInk} />
                        <Text style={styles.bullet}>{c}</Text>
                      </View>
                    ))}
                  </Pressable>
                );
              })}
            </ScrollView>

            <Field label="Or enter your own crop">
              <TextField
                value={sel.customCrop}
                onChangeText={(customCrop) => onSelectionChange(i, { customCrop })}
                placeholder="Type a crop name to override"
                autoCapitalize="words"
              />
              {/* Checked against the plot the farmer just described, so a crop
                  the field cannot grow is named before they commit to it. */}
              <CropFeasibilityNote
                crop={sel.customCrop}
                conditions={{
                  soilType: farms[i]?.soilType,
                  irrigation: farmIrrigationLabel(farms[i]),
                }}
              />
            </Field>

            <Field label="Seeding date">
              <DateField
                value={sel.seedingDate}
                onChange={(seedingDate) => onSelectionChange(i, { seedingDate })}
              />
            </Field>

            <Field
              label="Estimated harvest date"
              error={harvestInvalid ? "Harvest date must be after the seeding date." : null}
            >
              <DateField
                value={sel.estimatedHarvestDate}
                onChange={(estimatedHarvestDate) =>
                  onSelectionChange(i, { estimatedHarvestDate })
                }
                minimumDate={sel.seedingDate ? new Date(sel.seedingDate) : undefined}
              />
            </Field>

            {!chosen && (
              <Text style={styles.warn}>Pick a crop for this farm, or type your own.</Text>
            )}
          </View>
        );
      })}

      <Pressable style={styles.termsRow} onPress={() => onTermsChange(!termsAccepted)}>
        <View style={[styles.checkbox, termsAccepted && styles.checkboxOn]}>
          {termsAccepted && <Ionicons name="checkmark" size={14} color={themeColors.onPrimary} />}
        </View>
        <Text style={styles.termsText}>
          I agree to the Terms of Service and Privacy Policy, and confirm the details above are
          correct.
        </Text>
      </Pressable>
    </View>
  );
}

function riskStyle(risk: CropRec["riskScore"]) {
  if (risk === "Low") return { backgroundColor: colors.sage };
  if (risk === "Medium") return { backgroundColor: tokens.accentSoft };
  return { backgroundColor: colors.dangerBg };
}

function riskTextStyle(risk: CropRec["riskScore"]) {
  if (risk === "Low") return { color: colors.primary };
  if (risk === "Medium") return { color: colors.amberInk };
  return { color: colors.danger };
}

const styles = themed(() => StyleSheet.create({
  block: { marginBottom: 26 },
  farmTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 10,
  },
  recRow: { gap: 12, paddingBottom: 14, paddingRight: 4 },
  recCard: {
    width: 220,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  recCardActive: { borderColor: colors.primary },
  recHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recName: { fontSize: 16, fontWeight: "800", color: colors.ink, flexShrink: 1 },
  badgeRow: { flexDirection: "row", gap: 6, marginTop: 8, marginBottom: 10 },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.sage,
  },
  badgeText: { fontSize: 12, fontWeight: "700", color: colors.primary },
  recMeta: { fontSize: 12, color: colors.textSoft, marginBottom: 3 },
  bulletRow: { flexDirection: "row", gap: 5, marginTop: 6, alignItems: "flex-start" },
  bullet: { fontSize: 12, color: colors.textFaint, flex: 1, lineHeight: 15 },
  warn: { fontSize: 12, color: colors.danger, marginTop: 2 },

  termsRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 4 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.sageLine,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  termsText: { flex: 1, fontSize: 13, color: colors.textSoft, lineHeight: 19 },
}));
