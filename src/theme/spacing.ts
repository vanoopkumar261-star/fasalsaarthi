/**
 * 4pt scale (DESIGN_SPEC §43). The app previously hardcoded 200 padding values;
 * anything that is not on this scale is a bug, not a preference.
 */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  xxxl: 48,
} as const;

/** Screen padding, and the gap that separates one card from the next. */
export const layout = {
  screenX: 20,
  screenTop: 8,
  screenBottom: 48,
  cardGap: 16,
  sectionGap: 24,
  cardPadding: 20,
  /** §43/§49: nothing tappable is ever smaller than this. */
  touchTarget: 44,
} as const;

/** §44 — four values, replacing the 25 the codebase had grown. */
export const radius = {
  sm: 8,
  card: 16,
  lg: 24,
  pill: 999,
} as const;
