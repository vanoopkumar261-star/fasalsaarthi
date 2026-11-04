import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  Newsreader_400Regular,
  Newsreader_500Medium,
  Newsreader_600SemiBold,
} from "@expo-google-fonts/newsreader";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { warmUpSpeech } from "../lib/speech";
import { loadVoiceGuide } from "../lib/voiceGuide";
import { LanguageProvider } from "../components/i18n/LanguageProvider";
import { AgentProvider } from "../components/agent/AgentProvider";
import { VoiceAgentProvider } from "../components/agent/VoiceAgent";
import { colors } from "../theme";
import * as Notifications from "expo-notifications";
import { configureNotifications } from "../lib/push";
import { ThemeProvider, useTheme } from "../theme/ThemeProvider";

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * The root layout used to be ten lines: a bare Stack and nothing else. Fonts,
 * safe areas, gesture handling and the language provider all now mount here,
 * once, above every route.
 */
export default function RootLayout() {
  const router = useRouter();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Newsreader_400Regular,
    Newsreader_500Medium,
    Newsreader_600SemiBold,
  });

  useEffect(() => {
    warmUpSpeech();
    loadVoiceGuide();
  }, []);

  useEffect(() => {
    // A font that fails to download must not leave the farmer on a dead splash
    // screen — the app falls back to the system face and carries on.
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  /**
   * Notification display and tap routing.
   *
   * Mounted here rather than in a screen because a notification can be what
   * STARTS the app: a listener registered inside a route would miss the tap
   * that opened it, so the cold-start response is read once as well.
   *
   * Registered unconditionally, and that is safe — none of this touches FCM.
   * It sets how a notification is shown and where a tap goes; fetching a push
   * token is a separate, explicit call (see lib/push.ts).
   */
  useEffect(() => {
    void configureNotifications();

    const route = (data: unknown) => {
      const target = (data as { route?: unknown } | null | undefined)?.route;
      // Only a route this app published into its own payload is followed.
      if (typeof target === "string" && target.startsWith("/(app)/")) {
        router.push(target as never);
      }
    };

    const sub = Notifications.addNotificationResponseReceivedListener((response) =>
      route(response.notification.request.content.data)
    );

    // The tap that launched the app never reaches the listener above.
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) route(response.notification.request.content.data);
      })
      .catch(() => {});

    return () => sub.remove();
  }, [router]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <LanguageProvider>
            <AgentProvider>
              <VoiceAgentProvider>
                <ThemedStack />
              </VoiceAgentProvider>
            </AgentProvider>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Keyed on the scheme: switching light/dark remounts the screens so every style sheet rebuilds. */
function ThemedStack() {
  const { scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        key={scheme}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          // Android's own fade-through rather than the iPhone push: run natively,
          // so it stays smooth on low-end phones and obeys "Remove animations".
          animation: "fade_from_bottom",
        }}
      />
    </>
  );
}
