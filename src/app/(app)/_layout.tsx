import { Stack } from "expo-router";
import { colors } from "@/theme";

/**
 * The authenticated stack. Every screen pushes onto the hub, so both the header
 * chevron and the Android Back button land back on home.
 */
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        // Android's own fade-through rather than the iPhone push: run natively,
        // so it stays smooth on low-end phones and obeys "Remove animations".
        animation: "fade_from_bottom",
      }}
    />
  );
}
