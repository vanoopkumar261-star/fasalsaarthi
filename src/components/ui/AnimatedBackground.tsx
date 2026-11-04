import { StyleSheet, View } from "react-native";
import { colors } from "@/theme";

/** Plain themed ground for the screens outside the signed-in stack (splash, sign-in, onboarding). */
export function AnimatedBackground() {
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} pointerEvents="none" />;
}
