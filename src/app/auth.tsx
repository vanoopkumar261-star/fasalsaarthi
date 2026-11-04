import { Redirect } from "expo-router";
import { View } from "react-native";
import { AuthScreen } from "@/components/AuthScreen";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";
import { useSession } from "@/lib/session";

/**
 * Signing in has to move the farmer off this screen, and nothing was doing it.
 *
 * Before auth became its own route, `app/index.tsx` rendered <AuthScreen/>
 * inline in the same component that called useSession() — a new session
 * re-rendered that component straight into the dashboard. Moving AuthScreen
 * here left the session listener behind on "/", which is not mounted while
 * this screen is showing, so Supabase wrote the session and absolutely nothing
 * reacted to it: the form just sat there with no error.
 *
 * Redirecting to "/" rather than to the hub is deliberate — the gate there owns
 * the "is this farmer registered?" decision, so a brand-new account still goes
 * through onboarding instead of skipping it. This covers sign-up too.
 */
export default function AuthRoute() {
  const { session } = useSession();

  // Only on a truthy session: redirecting while it is momentarily null would
  // bounce /auth -> / -> /auth.
  if (session) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1 }}>
      <AnimatedBackground />
      <AuthScreen />
    </View>
  );
}
