import { colors as t } from "../theme/colors";

/**
 * DEPRECATED — import from `@/theme` instead.
 *
 * Kept as a shim so the screens written against `colors.x` keep compiling
 * while they are migrated one at a time. Every key is a live getter onto the
 * active scheme's semantic token, so it follows light/dark like everything else.
 */
const ALIAS = {
  ink: "text",
  primary: "primary",
  leaf: "leaf",
  sage: "surfaceSoft",
  sageLine: "border",
  bg: "bg",
  surface: "surface",
  amber: "accent",
  amberInk: "goldInk",
  danger: "danger",
  dangerBg: "dangerSoft",
  textSoft: "textSecondary",
  textFaint: "textMuted",
  earthBrown: "earth",
  optimal: "optimal",
  attention: "attention",
  neutral: "neutral",
} as const;

export const colors = Object.defineProperties(
  {} as { [K in keyof typeof ALIAS]: string },
  Object.fromEntries(
    Object.entries(ALIAS).map(([k, role]) => [k, { get: () => t[role], enumerable: true }]),
  ),
);
