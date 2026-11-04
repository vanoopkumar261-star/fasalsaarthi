import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/colors";
import { cardShadow } from "@/constants/effects";
import { locationLabel, type SelectedLocation } from "@/lib/geocode";
import { Field, TextField } from "./fields";
import { MapPicker } from "./MapPicker";

import { themed } from "@/theme";
export type ProfileDraft = {
  name: string;
  phone: string;
  email: string;
  location?: SelectedLocation;
};

type Props = {
  value: ProfileDraft;
  onChange: (patch: Partial<ProfileDraft>) => void;
  onBlurField: (key: string) => void;
  errors: { name: string | null; phone: string | null; email: string | null };
};

export function StepProfile({ value, onChange, onBlurField, errors }: Props) {
  return (
    <View>
      <Field label="Full name" error={errors.name}>
        <TextField
          value={value.name}
          onChangeText={(name) => onChange({ name })}
          onBlur={() => onBlurField("name")}
          placeholder="e.g. Anoop Kumar"
          invalid={Boolean(errors.name)}
          autoCapitalize="words"
        />
      </Field>

      <Field label="Phone number" error={errors.phone}>
        <TextField
          value={value.phone}
          onChangeText={(phone) => onChange({ phone })}
          onBlur={() => onBlurField("phone")}
          placeholder="10-digit mobile number"
          keyboardType="phone-pad"
          invalid={Boolean(errors.phone)}
        />
      </Field>

      <Field label="Email" error={errors.email}>
        <TextField
          value={value.email}
          onChangeText={(email) => onChange({ email })}
          onBlur={() => onBlurField("email")}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          invalid={Boolean(errors.email)}
        />
      </Field>

      <Text style={styles.label}>House location</Text>
      <Text style={styles.sub}>
        Used for weather, nearby mandi prices and local scheme matching.
      </Text>

      <MapPicker value={value.location} onChange={(location) => onChange({ location })} />

      {value.location ? (
        <View style={[styles.picked, cardShadow]}>
          <Text style={styles.pickedLabel}>SELECTED</Text>
          <Text style={styles.pickedText}>{locationLabel(value.location)}</Text>

          {/* Filled in from the map, but editable: OSM does not know a PIN for
              every hamlet, and the farmer always does. */}
          <Text style={styles.pinLabel}>PIN code</Text>
          <TextField
            value={value.location.pincode ?? ""}
            onChangeText={(pincode) =>
              onChange({
                location: value.location
                  ? { ...value.location, pincode: pincode.replace(/\D/g, "").slice(0, 6) }
                  : undefined,
              })
            }
            placeholder="6-digit PIN"
            keyboardType="number-pad"
            maxLength={6}
          />
        </View>
      ) : (
        <Text style={styles.required}>Pick your location to continue.</Text>
      )}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  label: { fontSize: 13, fontWeight: "700", color: colors.ink, marginBottom: 4 },
  sub: { fontSize: 13, color: colors.textFaint, marginBottom: 12 },
  picked: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
  },
  pickedLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.leaf,
    marginBottom: 4,
  },
  pickedText: { fontSize: 15, color: colors.ink, lineHeight: 20 },
  pinLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.leaf,
    marginTop: 12,
    marginBottom: 6,
  },
  required: { marginTop: 12, fontSize: 13, color: colors.textFaint },
}));
