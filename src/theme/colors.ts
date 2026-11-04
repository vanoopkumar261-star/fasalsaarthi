import { palette } from "./palette";

/**
 * Semantic colour roles. Screens name the JOB a colour does, never the hue, so
 * that a palette change is one edit here rather than a sweep of 35 files.
 *
 * Two schemes. Light is the "valley morning" look — mint ground, white cards,
 * a deep teal band, bright teal/green/coral tiles. Dark is the website's dark
 * theme. `colors` always holds the ACTIVE scheme: ThemeProvider calls
 * `applyScheme()` and remounts the tree, and module-level style sheets are
 * wrapped in `themed()` so they rebuild for the new scheme.
 */
const light = {
  bg: "#F2F7F4",
  bgSunken: "#E7EFEA",
  surface: "#FFFFFF",
  surfaceSoft: "#EAF4EE",
  border: "#DCE7E1",
  /** The deep teal band the home content sits on; hero cards. */
  band: "#2E4A44",
  bandDeep: "#233A35",

  primary: "#2F8A55",
  primaryPressed: "#23704A",
  primaryDeep: "#1F5E3E",
  onPrimary: "#FFFFFF",
  ripple: "rgba(46, 74, 68, 0.10)",
  rippleOnDark: "rgba(255, 255, 255, 0.24)",
  leaf: "#3C8C5C",
  leafSoft: "#9BCFA9",

  accent: "#E5A93B",
  accentSoft: "#FBF1DC",
  goldInk: palette.gold700,

  danger: "#C4513A",
  dangerSoft: "#FCEBE7",
  info: "#3F7FA8",
  infoSoft: "#E6F1F8",
  earth: palette.soil500 as string,

  text: "#1F3A34",
  textSecondary: "#4B635D",
  textMuted: "#6B7F79",
  textOnDark: palette.white as string,
  textOnDarkSoft: "rgba(255,255,255,0.78)",

  /** Status. Every use must also carry a glyph or a word — never colour alone. */
  optimal: "#2F8A55",
  attention: "#B7791F",
  critical: "#C4513A",
  neutral: "#6B7F79",

  /** Home tiles: bright, white glyph box, white label. */
  tileTeal: "#4BAAB1",
  tileGreen: "#5BAE6E",
  tileCoral: "#EE8774",
  tileGold: "#E2A84A",
  tileSky: "#6E9BD6",

  severity: {
    red: palette.severityRed as string,
    orange: palette.severityOrange as string,
    yellow: palette.severityYellow as string,
    clear: palette.severityClear as string,
  },
  severityRedBg: "#FCEDED",
  severityRedBorder: "#E3A0A0",
  severityAmberBg: "#FBF3DF",
  severityAmberBorder: "#E0C880",
  severityClearBg: "#EFF6EF",
  severityClearBorder: "#BBD6C2",

  blush: "#FBE3DF",
  blushInk: "#C9748A",
  scrim: "rgba(20,40,35,0.45)",
};

export type Colors = { [K in keyof typeof light]: (typeof light)[K] extends string ? string : (typeof light)[K] };

const dark: Colors = {
  bg: palette.night0,
  bgSunken: palette.night1,
  surface: palette.night2,
  surfaceSoft: palette.night3,
  border: palette.nightLine,
  band: palette.nightBand,
  bandDeep: palette.nightBandDeep,

  primary: palette.nightGreen,
  primaryPressed: palette.nightGreenHi,
  primaryDeep: palette.nightGreenHi,
  /** Type and icons ON a primary fill: the ground, 8.8:1. White would be 2.3:1. */
  onPrimary: palette.night0,
  ripple: "rgba(255, 255, 255, 0.10)",
  rippleOnDark: "rgba(7, 8, 9, 0.22)",
  leaf: palette.nightLeaf,
  leafSoft: palette.nightLeafSoft,

  accent: palette.nightGold,
  accentSoft: palette.nightGoldTint,
  goldInk: palette.nightGoldInk,

  danger: palette.nightBrick,
  dangerSoft: palette.nightBrickTint,
  info: palette.nightSky,
  infoSoft: palette.nightSkyTint,
  earth: palette.nightEarth,

  text: palette.nightInk,
  textSecondary: palette.nightInk2,
  textMuted: palette.nightMuted,
  textOnDark: palette.white,
  textOnDarkSoft: "rgba(255,255,255,0.72)",

  optimal: palette.nightGreen,
  attention: palette.nightGold,
  critical: palette.nightBrick,
  neutral: palette.nightMuted,

  tileTeal: "#2A7177",
  tileGreen: "#2E6E41",
  tileCoral: "#A9503F",
  tileGold: "#8E6A1E",
  tileSky: "#3A5F8F",

  severity: light.severity,
  severityRedBg: "#2A1713",
  severityRedBorder: "#6B2E22",
  severityAmberBg: "#221E18",
  severityAmberBorder: "#6B5520",
  severityClearBg: "#14201A",
  severityClearBorder: "#2C5A3D",

  blush: "#2A1A20",
  blushInk: "#E79AAE",
  scrim: "rgba(0,0,0,0.6)",
};

export type Scheme = "light" | "dark";

let current: Scheme = "light";

/** The active scheme's roles. Mutated in place by applyScheme(). */
export const colors: Colors = { ...light };

export function applyScheme(s: Scheme) {
  current = s;
  Object.assign(colors, s === "dark" ? dark : light);
}

export function activeScheme(): Scheme {
  return current;
}

/**
 * Wraps a module-level style sheet (or any object built from `colors`) so it
 * is rebuilt for whichever scheme is active when it is read. Usage is
 * unchanged: `const styles = themed(() => StyleSheet.create({...}))`, then
 * `styles.card` as before.
 */
export function themed<T extends object>(make: () => T): T {
  const cache: Partial<Record<Scheme, T>> = { [current]: make() };
  const now = () => (cache[current] ??= make()) as Record<PropertyKey, unknown>;
  return new Proxy({} as T, {
    get: (_t, k) => now()[k],
    has: (_t, k) => k in now(),
    ownKeys: () => Reflect.ownKeys(now()),
    getOwnPropertyDescriptor: (_t, k) => {
      const d = Reflect.getOwnPropertyDescriptor(now(), k);
      return d && { ...d, configurable: true };
    },
  });
}
