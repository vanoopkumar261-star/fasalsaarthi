import { useEffect, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { colors } from "@/constants/colors";
import { speak, stopSpeaking } from "@/lib/speech";
import { voiceGuideOn } from "@/lib/voiceGuide";

import { themed } from "@/theme";
type Mode = "sign-in" | "sign-up";

/**
 * Sign-in stays typed (nobody should say a password out loud), but every step
 * is spoken, in Hindi and then English, since the language picker is behind
 * this screen. Respects the "talking app" switch.
 */
const NARRATION = {
  intro: [
    "नमस्ते। एजेंट फ़ार्मर में आपका स्वागत है। अपना ईमेल और पासवर्ड लिखिए, या किसी से मदद लीजिए। नए हैं तो खाता बनाइए दबाइए।",
    "Welcome to FasalSaarthi. Type your email and password, or ask someone to help. New here? Tap Create account.",
  ],
  email: ["अपना ईमेल लिखिए।", "Type your email."],
  password: ["अपना पासवर्ड लिखिए। कम से कम छह अक्षर।", "Type your password, at least six characters."],
  signUp: ["नया खाता बनाइए। ईमेल और पासवर्ड लिखिए।", "Create a new account with your email and a password."],
  badEmail: ["ईमेल सही नहीं है।", "That email is not valid."],
  shortPassword: ["पासवर्ड कम से कम छह अक्षर का होना चाहिए।", "The password needs at least six characters."],
  failed: ["साइन इन नहीं हुआ। ईमेल और पासवर्ड जाँचिए।", "Sign in failed. Please check your email and password."],
  working: ["रुकिए, खाता खोल रहे हैं।", "Please wait, opening your account."],
} as const;

let narration = 0;

async function narrate(key: keyof typeof NARRATION): Promise<void> {
  if (!voiceGuideOn()) return;
  const mine = ++narration;
  stopSpeaking();
  const [hi, en] = NARRATION[key];
  await speak(hi, "hi");
  // A newer narration (the farmer tapped the next field) cut this one off.
  if (mine === narration) await speak(en, "en");
}

/**
 * Same method as the web app's AuthPanel: plain Supabase Auth
 * email+password, no custom backend. "Confirm email" is off on the project,
 * so signUp returns a live session immediately.
 */
export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    narrate("intro");
    return stopSpeaking;
  }, []);

  async function submit() {
    setError(null);
    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      narrate("badEmail");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      narrate("shortPassword");
      return;
    }

    setLoading(true);
    narrate("working");
    const { error: authError } =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (authError) {
      narrate("failed");
      if (mode === "sign-up" && /already registered/i.test(authError.message)) {
        setError("That email is already registered — try signing in instead.");
        setMode("sign-in");
      } else {
        setError(authError.message);
      }
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          <View style={styles.brand}>
            <Text style={styles.wordmark}>FasalSaarthi</Text>
            <Text style={styles.tagline}>Your crop-care companion.</Text>
          </View>

          <View style={styles.tabs}>
            <Pressable
              onPress={() => setMode("sign-in")}
              style={[styles.tab, mode === "sign-in" && styles.tabActive]}
            >
              <Text style={[styles.tabText, mode === "sign-in" && styles.tabTextActive]}>
                Sign in
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setMode("sign-up");
                narrate("signUp");
              }}
              style={[styles.tab, mode === "sign-up" && styles.tabActive]}
            >
              <Text style={[styles.tabText, mode === "sign-up" && styles.tabTextActive]}>
                Create account
              </Text>
            </Pressable>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onFocus={() => narrate("email")}
              placeholder="you@example.com"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              onFocus={() => narrate("password")}
              placeholder="••••••••"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={submit}
            disabled={loading}
            style={({ pressed }) => [styles.submit, pressed && styles.submitPressed]}
          >
            {loading ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.submitText}>
                {mode === "sign-in" ? "Sign in" : "Create account"}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent" },
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: "center", paddingHorizontal: 28, gap: 20 },
  brand: { alignItems: "center", marginBottom: 12, gap: 4 },
  wordmark: { fontSize: 28, fontWeight: "700", color: colors.ink },
  tagline: { fontSize: 15, color: colors.textFaint },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.sage,
    borderRadius: 16,
    padding: 4,
    marginBottom: 4,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  tabActive: { backgroundColor: colors.surface },
  tabText: { fontSize: 15, fontWeight: "600", color: colors.textFaint },
  tabTextActive: { color: colors.primary },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textSoft },
  input: {
    borderWidth: 1,
    borderColor: colors.sageLine,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    padding: 10,
    borderRadius: 8,
    fontSize: 13,
  },
  submit: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
  },
  submitPressed: { opacity: 0.85 },
  submitText: { color: colors.bg, fontWeight: "700", fontSize: 15 },
}));
