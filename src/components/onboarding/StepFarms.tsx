import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/colors";
import { cardShadow } from "@/constants/effects";
import { SOIL_TYPES, type FarmDraft } from "@/lib/onboarding";
import {
  IRRIGATION_METHODS,
  IRRIGATION_SOURCES,
  METHOD_EN,
  METHOD_HINT,
  SOURCE_EN,
  WATER_REGIMES,
  REGIME_EN,
} from "@/lib/irrigationCatalog";
import { SoilPicker } from "./SoilPicker";
import { ChipSelect, Counter, Field, TextField } from "./fields";

import { themed } from "@/theme";
type Props = {
  farms: FarmDraft[];
  farmAreaErrors: (string | null)[];
  maxFarms: number;
  onNumFarmsChange: (next: number) => void;
  onFarmChange: (index: number, patch: Partial<FarmDraft>) => void;
  onBlurField: (key: string) => void;
};

/**
 * The hard ceiling on registration, whatever the plan allows. Elite permits
 * twenty fields; nobody types twenty of them into a phone in one sitting, and
 * "+ Add farm" exists for the rest.
 */
export const MAX_FARMS = 6;

export function StepFarms({
  farms,
  farmAreaErrors,
  maxFarms,
  onNumFarmsChange,
  onFarmChange,
  onBlurField,
}: Props) {
  /*
    Read-only, and the only figure on this step that is. It is the sum of the
    field areas entered below, so there is nothing here to get wrong and
    nothing to keep in step by hand. It used to be a typed box with its own
    validator, which meant a farmer could tell us four acres and then describe
    two plots of one — and both numbers were saved.
  */
  const areas = farms.map((f) => Number(f.area));
  const withArea = areas.filter((n) => Number.isFinite(n) && n > 0);
  const totalAcres = withArea.reduce((sum, n) => sum + n, 0);
  // Two decimals, then trimmed, so 1.5 + 2 reads "3.5" and not "3.50".
  const totalLabel = totalAcres ? String(Number(totalAcres.toFixed(2))) : "—";

  return (
    <View>
      <Field label="Total land area (acres)">
        <View style={styles.total} accessibilityLiveRegion="polite">
          <View style={styles.totalValue}>
            <Text style={styles.totalNum}>{totalLabel}</Text>
            <Text style={styles.totalUnit}>acres</Text>
          </View>
          <Text style={styles.totalMeta}>
            {withArea.length === farms.length
              ? `${farms.length} ${farms.length === 1 ? "field" : "fields"}`
              : `${withArea.length} / ${farms.length}`}
          </Text>
        </View>
      </Field>

      <Field label={`Number of farms (max ${maxFarms})`}>
        <Counter value={farms.length} min={1} max={maxFarms} onChange={onNumFarmsChange} />
      </Field>

      {farms.map((farm, i) => (
        <View key={i} style={[styles.card, cardShadow]}>
          <Text style={styles.cardTitle}>Farm {i + 1}</Text>

          <Field label="Area (acres)" error={farmAreaErrors[i]}>
            <TextField
              value={farm.area}
              onChangeText={(area) => onFarmChange(i, { area })}
              onBlur={() => onBlurField(`farm-${i}-area`)}
              placeholder="e.g. 2"
              keyboardType="decimal-pad"
              invalid={Boolean(farmAreaErrors[i])}
            />
          </Field>

          <Field label="Soil type">
            <SoilPicker
              options={SOIL_TYPES}
              value={farm.soilType}
              onChange={(soilType) => onFarmChange(i, { soilType })}
            />
          </Field>

          {/*
            Three questions, not one. Water source and application method are
            different facts, and the method is the one that decides how much
            water this farm is told to pump — asking them together meant the
            farmer discarded whichever half they did not tap.
          */}
          <Field label="Water">
            <ChipSelect
              options={WATER_REGIMES}
              value={farm.regime}
              labelFor={(r) => REGIME_EN[r as keyof typeof REGIME_EN]}
              onChange={(regime) =>
                onFarmChange(i, {
                  regime: regime as FarmDraft["regime"],
                  // A rain-fed farm has neither a source nor a method. Leaving
                  // stale values behind would write a contradiction: no
                  // irrigation, applied by drip.
                  ...(regime === "rainfed" ? { source: "" as const, method: "" as const } : {}),
                })
              }
            />
          </Field>

          {farm.regime === "irrigated" && (
            <>
              <Field label="Water source">
                <ChipSelect
                  options={IRRIGATION_SOURCES}
                  value={farm.source}
                  labelFor={(s) => SOURCE_EN[s as keyof typeof SOURCE_EN]}
                  onChange={(source) => onFarmChange(i, { source: source as FarmDraft["source"] })}
                />
              </Field>

              <Field label="How the water reaches the crop">
                <ChipSelect
                  options={IRRIGATION_METHODS}
                  value={farm.method}
                  labelFor={(m) => METHOD_EN[m as keyof typeof METHOD_EN]}
                  onChange={(method) => onFarmChange(i, { method: method as FarmDraft["method"] })}
                />
                {farm.method ? (
                  <Text style={styles.hint}>
                    {METHOD_HINT[farm.method as keyof typeof METHOD_HINT]}
                  </Text>
                ) : null}
              </Field>
            </>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 12,
  },
  total: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.sageLine,
    backgroundColor: colors.sage,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  totalValue: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  totalNum: { fontSize: 22, fontWeight: "800", color: colors.ink },
  totalUnit: { fontSize: 13, color: colors.textFaint },
  totalMeta: { fontSize: 11, color: colors.textFaint, textTransform: "uppercase" },
  hint: { marginTop: 8, fontSize: 12, color: colors.textFaint, lineHeight: 17 },
}));
