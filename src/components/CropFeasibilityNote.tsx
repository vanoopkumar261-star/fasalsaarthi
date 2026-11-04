import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { assessCropFeasibility, type FieldConditions } from "@/lib/cropFeasibility";
import { colors, radius, space, type, themed } from "@/theme";

/**
 * What this field will actually grow.
 *
 * The freehand crop box accepted anything — a farmer could register cocoa on a
 * Nagpur black-soil plot and nothing objected, then every downstream number
 * (water demand, stage timeline, yield estimate, health score) would be
 * computed for a crop that cannot be grown there.
 *
 * The verdict is advisory on purpose. `unsuitable` is shown plainly and the
 * reasons are named, but the farmer is not blocked: they know their own land,
 * and an engine working from five soil names and a forecast is not entitled to
 * overrule them. What it is entitled to do is say so before they commit.
 *
 * An unrecognised name says nothing at all rather than guessing — the app's
 * vocabulary is 26 crops and India grows rather more than that.
 */
export function CropFeasibilityNote({
  crop,
  conditions,
}: {
  crop: string;
  conditions: FieldConditions;
}) {
  const name = crop.trim();
  if (!name) return null;

  const result = assessCropFeasibility(name, conditions);
  if (result.verdict === "unknown" || result.verdict === "ok") return null;

  const blocking = result.verdict === "unsuitable";

  return (
    <View style={[styles.box, blocking ? styles.boxBad : styles.boxWarn]}>
      <View style={styles.head}>
        <MaterialCommunityIcons
          name={blocking ? "alert-circle-outline" : "alert-outline"}
          size={16}
          color={blocking ? colors.critical : colors.attention}
        />
        <Text style={[styles.title, { color: blocking ? colors.critical : colors.attention }]}>
          {blocking
            ? `${result.crop} is a poor fit for this field`
            : `${result.crop} will grow, with a catch`}
        </Text>
      </View>

      {result.reasons.map((r) => (
        <Text key={r.msgKey + r.condition} style={styles.reason}>
          {r.label}
        </Text>
      ))}

      {result.alternatives.length > 0 ? (
        <Text style={styles.alts}>
          Suits this field: {result.alternatives.slice(0, 4).join(", ")}
        </Text>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  box: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space.sm,
    gap: 4,
    marginTop: 6,
  },
  boxBad: { borderColor: colors.severityRedBorder, backgroundColor: colors.severityRedBg },
  boxWarn: { borderColor: colors.severityAmberBorder, backgroundColor: colors.severityAmberBg },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { ...type.secondary, fontWeight: "700", flex: 1, minWidth: 0 },
  reason: { ...type.meta, color: colors.textSecondary, lineHeight: 17 },
  alts: { ...type.meta, color: colors.textMuted, marginTop: 2 },
}));
