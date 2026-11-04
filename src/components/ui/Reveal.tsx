import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { duration } from "../../theme";

/**
 * Wraps a screen's loaded content so it fades in over the skeleton's place
 * instead of snapping in. Short and opacity-only: it acknowledges the data
 * arriving without making anyone wait. Reanimated's layout animations follow
 * the system "Remove animations" setting on their own (ReduceMotion.System).
 */
export function Reveal({ children }: { children: ReactNode }) {
  return (
    <Animated.View entering={FadeIn.duration(duration.base)} style={styles.fill}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
