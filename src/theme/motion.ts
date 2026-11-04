import { AccessibilityInfo } from "react-native";
import { useEffect, useState } from "react";

export const duration = { fast: 140, base: 220, slow: 380 } as const;

/** The hub's bloom and every card entrance use this one spring. */
export const spring = { damping: 15, stiffness: 180, mass: 0.9 } as const;

/**
 * The web honours `prefers-reduced-motion` in four places; mobile honoured it
 * nowhere — the ambient background looped forever regardless. Every animation
 * must consult this and fall back to an instant state change.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduced(v));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
