import type { ViewStyle } from "react-native";

/** Subtle brand-tinted shadow for cards, replacing the flat bordered look. */
export const cardShadow: ViewStyle = {
  shadowColor: "#000000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
};

/** Slightly stronger lift for the AI/Agent insight card, so it reads as the "warm" standout. */
export const insightShadow: ViewStyle = {
  shadowColor: "#000000",
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.09,
  shadowRadius: 12,
  elevation: 3,
};

/** Cast upward onto content — for bars anchored to the bottom of the screen. */
export const topEdgeShadow: ViewStyle = {
  shadowColor: "#000000",
  shadowOffset: { width: 0, height: -2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 8,
};
