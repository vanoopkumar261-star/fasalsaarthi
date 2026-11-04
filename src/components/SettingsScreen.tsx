import { colors as themeColors } from "@/theme/colors";
import { PillTabs } from "./ui/PillTabs";
import { useTheme } from "@/theme/ThemeProvider";
import { setVoiceGuide, voiceGuideOn } from "../lib/voiceGuide";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useT } from "./i18n/LanguageProvider";
import { RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { getDashboardData } from "@/lib/dashboard";
import { resetTour } from "@/lib/tour";
import { registerForPush } from "@/lib/push";
import { colors } from "@/constants/colors";
import { cardShadow } from "@/constants/effects";
import { SkeletonHeader, SkeletonCard } from "./ui/Skeleton";
import { Reveal } from "./ui/Reveal";
import { themed } from "@/theme";
import { useScreenDescriber } from "@/lib/agent/screenRegistry";
import { PlanPanel } from "./PlanPanel";

type NotifPrefs = { weather: boolean; disease: boolean; market: boolean; ai: boolean };
const DEFAULT_NOTIF: NotifPrefs = { weather: true, disease: true, market: false, ai: true };

export function SettingsScreen() {
  const { t } = useT();
  const { appearance, setAppearance } = useTheme();
  const [talking, setTalking] = useState(voiceGuideOn());
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [farmerId, setFarmerId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [notif, setNotif] = useState<NotifPrefs>(DEFAULT_NOTIF);

  const load = useCallback(async () => {
    const dash = await getDashboardData();
    const farmer = dash.farmer;
    setFarmerId(farmer?.id ?? null);
    setName(farmer?.name ?? "");
    setPhone(farmer?.phone ?? "");
    setEmail(farmer?.email ?? "");
    setPreferences(farmer?.preferences ?? {});
    setNotif({ ...DEFAULT_NOTIF, ...(farmer?.preferences?.notifications ?? {}) });

    const { data } = await supabase.auth.getUser();
    if (data.user?.email) setUsername(data.user.email);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function toggleNotif(key: keyof NotifPrefs) {
    if (!farmerId) return;
    const next = { ...notif, [key]: !notif[key] };
    setNotif(next);
    await supabase
      .from("farmer_profiles")
      .update({ preferences: { ...preferences, notifications: next } })
      .eq("id", farmerId);

    // Switching anything on is the farmer asking to be notified, which is the
    // moment to ask the OS for permission — not app launch, where the prompt
    // arrives with no explanation of what it is for.
    //
    // The outcome is deliberately not surfaced. Nothing can be delivered until
    // a Firebase project exists for this build (see lib/push.ts), so a line
    // reading "notifications unavailable" would be reporting our missing
    // credentials to a farmer who can do nothing about it. The preference is
    // still recorded, exactly as before.
    if (next[key]) void registerForPush(farmerId);
  }

  async function saveProfile() {
    if (!farmerId) return;
    setSaving(true);
    const { error } = await supabase
      .from("farmer_profiles")
      .update({ name, phone, email: email || null })
      .eq("id", farmerId);
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  /**
   * Clearing the session was not enough on its own. The session watcher lives
   * in `app/index.tsx`, which is not mounted while this screen is showing, so
   * signing out emptied the session and left the farmer sitting on Settings
   * with nothing happening — the same shape of bug the sign-in screen had.
   *
   * `replace`, not `push`: the authenticated stack must not stay on the back
   * stack, or Back would walk straight back into the app after signing out.
   */
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } catch {
      // Even if the network call fails the local session is cleared, so the
      // gate is still the right place to end up.
    }
    router.replace("/");
  }

  useScreenDescriber("/settings", () =>
    "Settings: profile details, notification switches, the talking-app switch, and sign out. These are changed by tapping."
  );

  if (loading) {
    return (
      <SafeAreaView edges={["left", "right"]} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container} scrollEnabled={false}>
          <SkeletonHeader />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <Reveal>
      <SafeAreaView edges={["left", "right"]} style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.headerRow}>
          </View>

          {farmerId && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>{t("settings.section.profile")}</Text>
              <Field label="Name" value={name} onChangeText={setName} />
              <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
              {username && <Text style={styles.cardMeta}>Signed in as {username}</Text>}
              <Pressable onPress={saveProfile} disabled={saving} style={[styles.saveBtn, saving && styles.saveBtnDisabled]}>
                <Text style={styles.saveBtnText}>{saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}</Text>
              </Pressable>
            </View>
          )}

          {/* Membership sits above appearance: it is the one setting that
              changes what the rest of the app will let the farmer do. */}
          <PlanPanel />

          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t("settings.appearance")}</Text>
            <ToggleRow label={t("settings.voiceGuide")} on={talking} onToggle={() => {
              setVoiceGuide(!talking);
              setTalking(!talking);
            }} />
            <PillTabs
              tabs={(["system", "light", "dark"] as const).map((k) => ({ key: k, label: t(`settings.appearance.${k}`) }))}
              value={appearance}
              onChange={setAppearance}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t("settings.section.notifications")}</Text>
            <ToggleRow label="Weather alerts" on={notif.weather} onToggle={() => toggleNotif("weather")} />
            <ToggleRow label="Disease alerts" on={notif.disease} onToggle={() => toggleNotif("disease")} />
            <ToggleRow label="Market price alerts" on={notif.market} onToggle={() => toggleNotif("market")} />
            <ToggleRow label="AI daily summary" on={notif.ai} onToggle={() => toggleNotif("ai")} />
          </View>

          {/* One handset is often shared between family members, and the person
              who needs the tour is frequently not the person who dismissed it. */}
          {farmerId && (
            <Pressable
              onPress={async () => {
                await resetTour(farmerId);
                router.replace("/(app)/hub");
              }}
              accessibilityRole="button"
              style={[styles.card, cardShadow, styles.replayRow]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.replayTitle}>{t("tour.replay")}</Text>
                <Text style={styles.replayDesc}>{t("tour.replayDesc")}</Text>
              </View>
            </Pressable>
          )}

          <Pressable
            onPress={signOut}
            disabled={signingOut}
            accessibilityRole="button"
            accessibilityState={{ disabled: signingOut, busy: signingOut }}
            style={[styles.signOutBtn, signingOut && { opacity: 0.6 }]}
          >
            <Text style={styles.signOutText}>
              {signingOut ? t("settings.signingOut") : t("settings.signOut")}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Reveal>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "default" | "phone-pad" | "email-address";
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        style={styles.input}
        placeholderTextColor={colors.textFaint}
      />
    </View>
  );
}

function ToggleRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={on}
        onValueChange={onToggle}
        trackColor={{ true: colors.primary, false: colors.sageLine }}
        thumbColor={colors.surface}
        ios_backgroundColor={colors.sageLine}
      />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent" },
  container: { padding: 20, gap: 14, paddingBottom: 48 },

  headerRow: { marginBottom: 4, gap: 3 },
  eyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 1, color: colors.leaf },
  greeting: { fontSize: 24, fontWeight: "700", color: colors.ink },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: 24,
    padding: 18,
    gap: 12,
    ...cardShadow,
  },
  cardLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6, color: colors.leaf },
  cardMeta: { fontSize: 12, color: colors.textFaint },

  fieldLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.4, color: colors.textFaint, textTransform: "uppercase" },
  input: {
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.ink,
    backgroundColor: colors.bg,
  },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 12, alignItems: "center", marginTop: 4 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: themeColors.onPrimary, fontWeight: "700", fontSize: 13 },

  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  toggleLabel: { fontSize: 13, fontWeight: "600", color: colors.ink },

  signOutBtn: { borderWidth: 1, borderColor: colors.danger, borderRadius: 16, paddingVertical: 12, alignItems: "center" },
  signOutText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
  replayRow: { flexDirection: "row", alignItems: "center" },
  replayTitle: { fontSize: 14, fontWeight: "700", color: colors.ink },
  replayDesc: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
}));
