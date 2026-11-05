/**
 * WCAG relative-luminance and contrast helpers (night-vision.md, design §3.1).
 *
 * On pure black the WCAG contrast ratio is (L + 0.05) / 0.05, so a mode's text
 * ceiling fixes the maximum luminance any text token may reach. These functions
 * are pure and are used by the luminance property test that guards every token.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Parse a `#RRGGBB` hex string into 0..255 channels. Throws on malformed input. */
export function parseHex(hex: string): Rgb {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) {
    throw new Error(`Not a 6-digit hex colour: "${hex}"`);
  }
  const value = match[1] as string;
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

/** Linearise one 0..255 channel per the WCAG sRGB formula. */
function linearise(channel8: number): number {
  const c = channel8 / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0..1. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/** WCAG contrast ratio of a colour against pure black (#000000). */
export function contrastOnBlack(hex: string): number {
  return (relativeLuminance(hex) + 0.05) / 0.05;
}

/**
 * True when a colour is red-dominant per night-vision.md rule 2:
 * R >= 3 * max(G, B). Pure red (G=B=0) and the amber variant both pass because
 * amber keeps B=0 and G well under R/3.
 */
export function isRedDominant(hex: string): boolean {
  const { r, g, b } = parseHex(hex);
  return r >= 3 * Math.max(g, b);
}
