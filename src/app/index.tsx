import { Redirect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { useT } from "@/components/i18n/LanguageProvider";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";
import { hasFarmerProfile } from "@/lib/onboarding";
import { useSession } from "@/lib/session";
import { bodyFont, colors, layout, radius, space, type, themed } from "@/theme";

/** A hung fetch never settles, so `.catch()` alone cannot rescue the gate. */
const CHECK_TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

/**
 * The gate. It decides once and then hands off to a real route, so every screen
 * after this point has a back stack.
 *
 * The profile check used to be a bare `.then()`. On a phone that was a trap:
 * a rejected promise left `registered` undefined and this screen rendered a
 * spinner forever, with no message and no way out — and Supabase sets no fetch
 * timeout, so a weak signal could hang instead of failing. Both now land on a
 * retry. Crucially a failed check must NOT be read as "not registered", or a
 * registered farmer gets marched back through onboarding.
 */
export default function Index() {
  const { session, loading } = useSession();
  const { t, locale } = useT();

  /** undefined = not yet checked for the current session. */
  const [registered, setRegistered] = useState<boolean | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!session) {
      setRegistered(undefined);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setRegistered(undefined);
    setFailed(false);

    withTimeout(hasFarmerProfile(), CHECK_TIMEOUT_MS)
      .then((has) => {
        if (!cancelled) setRegistered(has);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (failed) {
    return (
      <View style={styles.fill}>
        <AnimatedBackground />
        <View style={styles.centre}>
          <Text style={[styles.title, { fontFamily: bodyFont(locale, "semi") }]}>
            {t("gate.checkFailed")}
          </Text>
          <Pressable onPress={retry} accessibilityRole="button" style={styles.retry}>
            <Text style={[styles.retryText, { fontFamily: bodyFont(locale, "semi") }]}>
              {t("common.retry")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (loading || (Boolean(session) && registered === undefined)) {
    return (
      <View style={styles.fill}>
        <AnimatedBackground />
        <View style={styles.centre}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!session) return <Redirect href="/auth" />;
  if (!registered) return <Redirect href="/onboarding" />;
  return <Redirect href="/(app)/hub" />;
}

const styles = themed(() => StyleSheet.create({
  fill: { flex: 1 },
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    paddingHorizontal: layout.screenX,
  },
  title: { ...type.body, color: colors.textSecondary, textAlign: "center" },
  retry: {
    minHeight: layout.touchTarget,
    paddingHorizontal: space.lg,
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  retryText: { ...type.body, color: colors.onPrimary },
}));
