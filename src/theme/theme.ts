/**
 * Trenzo Mockup — Design System
 * Editorial / Swiss / brutalist-minimal. Warm light-gray canvas, one loud
 * chartreuse accent, giant stacked grotesk headlines, strict 8pt grid.
 *
 * Tokens mirror MASTER PROMPT §2. Hex values are the documented starting
 * point — swap in exact screenshot-picked values here for a perfect match.
 */

export const colors = {
  canvas: '#E7E7E5', // warm light-gray app background
  surface: '#FFFFFF',
  ink: '#0A0A0A', // pure-black headlines & primary text
  inkMuted: '#ABABA9', // muted headline layer + muted subtitles
  meta: '#77776F', // small author/meta captions
  cardGray: '#C6C6C4', // the gray card
  cardGrayGraphic: '#8A8A88', // graphic inside gray card
  // Monochrome accent: primary = black, text/graphics on it = white.
  accent: '#0A0A0A', // primary action / active state (black)
  accentSub: 'rgba(255,255,255,0.62)', // muted text on a dark surface
  accentInk: '#FFFFFF', // text/graphics on the accent (white)
  onDarkMuted: 'rgba(255,255,255,0.62)',
  danger: '#E5484D', // reject
  success: '#30A46C', // approve / saved
  // Derived / utility
  scrim: 'rgba(10,10,10,0.55)',
  hairline: 'rgba(10,10,10,0.08)',
} as const;

export type ColorToken = keyof typeof colors;

/** 8pt grid. Use these multiples everywhere for vertical + horizontal rhythm. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
  screenH: 24, // screen horizontal padding
  cardGap: 14, // grid gap between cards
  cardPad: 16, // internal card padding
} as const;

export const radii = {
  card: 18,
  sheet: 24,
  pill: 999,
  sm: 10,
} as const;

/**
 * Typography scale. `family` maps to the bundled Inter static weights.
 * If General Sans / Archivo is bundled instead, only these family strings change.
 */
export const fonts = {
  black: 'Inter-Black',
  extraBold: 'Inter-ExtraBold',
  bold: 'Inter-Bold',
  semiBold: 'Inter-SemiBold',
  medium: 'Inter-Medium',
  regular: 'Inter-Regular',
} as const;

export const type = {
  display: {
    fontFamily: fonts.black,
    fontSize: 58,
    // RN clips glyphs when lineHeight < fontSize, so keep it >= fontSize.
    lineHeight: 62,
    letterSpacing: -1.2,
  },
  cardTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  sectionLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  bodyMedium: {
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 22,
  },
  meta: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  navLabel: {
    fontFamily: fonts.bold,
    fontSize: 16,
    lineHeight: 20,
  },
  navCounter: {
    fontFamily: fonts.semiBold,
    fontSize: 9,
    lineHeight: 10,
  },
  button: {
    fontFamily: fonts.bold,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
} as const;

/** Standard spring for press/scale micro-interactions (reanimated). */
export const spring = {
  damping: 18,
  stiffness: 220,
  mass: 0.7,
} as const;

export const timing = {
  fast: 200,
  base: 280,
  slow: 350,
} as const;

export const theme = { colors, spacing, radii, fonts, type, spring, timing };
export type Theme = typeof theme;
