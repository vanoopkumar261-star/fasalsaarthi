import { forwardRef, useState } from "react";
import {
  Pressable as RNPressable,
  type GestureResponderEvent,
  type PressableProps,
  type PressableStateCallbackType,
  type View,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { colors, spring } from "../../theme";

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

type Props = PressableProps & {
  /** The control sits on a bright primary fill: use the dark ripple. */
  onDark?: boolean;
  /** Feedback strength. "tick" (default) for ordinary taps, "thump" for the big moments (hub, mic, call). */
  haptic?: "tick" | "thump" | "none";
  /** How far it sinks while held. Big discs want less than small chips. */
  pressScale?: number;
};

/**
 * React Native's Pressable, with feedback a farmer can feel in a field: the
 * Android ripple, a spring "sink" while held, and a light haptic tick on touch.
 * Same API as react-native's Pressable — function styles and children still work.
 * The sink is skipped when the phone's "Remove animations" setting is on.
 */
export const Pressable = forwardRef<View, Props>(function Pressable(
  { android_ripple, onDark, haptic = "tick", pressScale = 0.96, style, children, onPressIn, onPressOut, ...rest },
  ref,
) {
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const interactive = !rest.disabled && !!(rest.onPress || rest.onLongPress);

  const ripple =
    android_ripple === null
      ? undefined
      : android_ripple ?? { color: onDark ? colors.rippleOnDark : colors.ripple, foreground: true };

  const state: PressableStateCallbackType = { pressed, hovered: false } as PressableStateCallbackType;
  const resolvedStyle = typeof style === "function" ? style(state) : style;
  const resolvedChildren = typeof children === "function" ? children(state) : children;

  return (
    <AnimatedPressable
      ref={ref}
      android_ripple={ripple}
      {...rest}
      onPressIn={(e: GestureResponderEvent) => {
        setPressed(true);
        if (interactive) {
          if (!reduceMotion) scale.value = withSpring(pressScale, spring);
          if (haptic === "tick") Haptics.selectionAsync().catch(() => {});
          else if (haptic === "thump") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        setPressed(false);
        scale.value = withSpring(1, spring);
        onPressOut?.(e);
      }}
      style={[resolvedStyle, animated]}
    >
      {resolvedChildren}
    </AnimatedPressable>
  );
});
