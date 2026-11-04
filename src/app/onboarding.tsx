import { useRouter } from "expo-router";
import { View } from "react-native";
import { OnboardingScreen } from "@/components/OnboardingScreen";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";

export default function OnboardingRoute() {
  const router = useRouter();
  return (
    <View style={{ flex: 1 }}>
      <AnimatedBackground />
      {/* replace, not push: finishing setup must not leave onboarding on the stack */}
      <OnboardingScreen onDone={() => router.replace("/(app)/hub")} />
    </View>
  );
}
