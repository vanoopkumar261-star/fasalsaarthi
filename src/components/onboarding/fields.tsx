import { colors as themeColors } from "@/theme/colors";
import { useState, type ReactNode } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";

import { colors } from "@/constants/colors";
import { themed } from "@/theme";

/** A labelled input with its validation message in a fixed slot below it. */
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function TextField(props: React.ComponentProps<typeof TextInput> & { invalid?: boolean }) {
  const { invalid, style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={colors.textFaint}
      {...rest}
      style={[styles.input, invalid && styles.inputInvalid, style]}
    />
  );
}

/** Horizontal wrap of selectable chips — the mobile stand-in for a <select>. */
/**
 * `labelFor` exists because the irrigation chips now store a slug and show a
 * word: the database column takes `rainwater_harvest`, the farmer reads
 * "Harvested rainwater". Callers with nothing to translate pass only
 * `options` and keep the old behaviour.
 */
export function ChipSelect({
  options,
  value,
  onChange,
  labelFor,
}: {
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
  labelFor?: (option: string) => string;
}) {
  return (
    <View style={styles.chipWrap}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {labelFor ? labelFor(opt) : opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Minus / count / plus, for the number-of-farms control. */
export function Counter({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <View style={styles.counter}>
      <Pressable
        style={[styles.counterBtn, value <= min && styles.counterBtnOff]}
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
      >
        <Ionicons name="remove" size={18} color={value <= min ? colors.textFaint : colors.primary} />
      </Pressable>
      <Text style={styles.counterValue}>{value}</Text>
      <Pressable
        style={[styles.counterBtn, value >= max && styles.counterBtnOff]}
        onPress={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
      >
        <Ionicons name="add" size={18} color={value >= max ? colors.textFaint : colors.primary} />
      </Pressable>
    </View>
  );
}

/**
 * Date input backed by the platform picker. Values are carried as ISO
 * `YYYY-MM-DD` strings, matching what the `crop_cycles` date columns store and
 * what the web app's `<input type="date">` produces.
 */
export function DateField({
  value,
  onChange,
  minimumDate,
}: {
  value: string;
  onChange: (iso: string) => void;
  minimumDate?: Date;
}) {
  const [open, setOpen] = useState(false);
  const parsed = value ? new Date(value) : new Date();
  const valid = !Number.isNaN(parsed.getTime());

  return (
    <>
      <Pressable style={styles.input} onPress={() => setOpen(true)}>
        <Text style={value ? styles.dateText : styles.datePlaceholder}>
          {value || "Select a date"}
        </Text>
      </Pressable>

      {open && (
        <DateTimePicker
          value={valid ? parsed : new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          minimumDate={minimumDate}
          onChange={(event, picked) => {
            // Android fires once and dismisses itself; iOS stays open until tapped away.
            if (Platform.OS === "android") setOpen(false);
            if (event.type === "dismissed" || !picked) return;
            // Local-date components, not toISOString() — the latter shifts to UTC
            // and can hand back yesterday for anyone east of Greenwich.
            const y = picked.getFullYear();
            const m = String(picked.getMonth() + 1).padStart(2, "0");
            const d = String(picked.getDate()).padStart(2, "0");
            onChange(`${y}-${m}-${d}`);
          }}
        />
      )}
    </>
  );
}

const styles = themed(() => StyleSheet.create({
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "700", color: colors.ink, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
    justifyContent: "center",
    minHeight: 46,
  },
  inputInvalid: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 12, marginTop: 5 },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.sageLine,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textSoft, fontWeight: "600" },
  chipTextActive: { color: themeColors.onPrimary },

  counter: { flexDirection: "row", alignItems: "center", gap: 18 },
  counterBtn: {
    width: 40,
    height: 40,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.sageLine,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  counterBtnOff: { opacity: 0.5 },
  counterValue: { fontSize: 18, fontWeight: "800", color: colors.ink, minWidth: 24, textAlign: "center" },

  dateText: { fontSize: 15, color: colors.ink },
  datePlaceholder: { fontSize: 15, color: colors.textFaint },
}));
