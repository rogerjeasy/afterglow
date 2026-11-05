# Night Shell — Design

**Companion to:** `requirements.md` (this spec), `night-vision.md` (invariant), `docs/afterglow-design.md` (the full visual contract, §3–§9).
**Implements:** `packages/design-system`.

## 1. Overview

The Night Shell token system is the single source of colour for every surface (native, web, print, Figma). Its job in this spec is narrow and verifiable: **define a red-only ramp, map semantic tokens onto it per mode, and prove in CI that no text pixel can exceed its mode's luminance ceiling.** Components (future) consume the semantic tokens only and are pixel-scanned by Playwright against the same ceilings.

## 2. Structure

```
packages/design-system/
  theme.night.json          single source of colour (ramp, amberRamp, ceilings, semantic-by-mode)
  src/
    luminance.ts            parseHex, relativeLuminance, contrastOnBlack, isRedDominant
    tokens.ts               typed loader: ramp, MODES, resolveToken(mode, token), TEXT_TOKENS
    index.ts
    luminance.property.test.ts   NS-01 .. NS-08 + token-shape guard
```

## 3. The token model

- **Ramp** — 16 pure-red stops `red.000` (`#000000`) … `red.1000` (`#FF0000`), values computed in design §4.1, not estimated.
- **Text ceilings** — `{ night: red.700, dusk: red.800, ember: red.1000 }`.
- **Semantic map** — one table per mode mapping roles (`bg`, `surface.1..3`, `hairline`, `glow`, `nontext.muted`, `text.secondary`, `text.primary`, `text.emphasis`, `icon.primary`, `control.fill`, `control.fill.primary`, `control.label.primary`, `focus.ring`, `alert.help`) to ramp keys. Surfaces, hairline, and glow are identical across modes; only text and icon tiers shift (design §4.2).
- **Amber ramp** — the protanopia variant at identical luminance stops, a separate hue.

`TEXT_TOKENS` names exactly the tokens the luminance ceiling applies to: `text.secondary`, `text.primary`, `text.emphasis`, `icon.primary`, `control.label.primary`, `alert.help`. Non-text tokens (hairlines, muted rules, fills) are deliberately excluded because they carry no reading content and fall under WCAG's 3:1 non-text rule instead.

## 4. Luminance maths

`relativeLuminance(hex)` applies the WCAG sRGB linearisation then the 0.2126/0.7152/0.0722 weights. `contrastOnBlack(hex) = (L + 0.05) / 0.05`. These are pure and are the backbone of NS-03, NS-06, NS-07. `isRedDominant` encodes `R >= 3*max(G,B)` for NS-02.

## 5. Why three modes (the key design decision)

From design §3.1: on pure black a red at the 8% Night ceiling tops out near 2.6:1 — below WCAG AA. No single palette can be both scotopic-safe and AA-conformant. The Night Shell therefore ships three modes sharing one layout and component set:

| Mode | When | Text ceiling | CR on black | Conformance |
|---|---|---|---|---|
| Night | ≤ ~5 lux | `#A50000` (L 8%) | 2.6:1 | disclosed night-vision instrument mode |
| Dusk | ~5–50 lux | `#B70000` (L 10%) | 3.04:1 | AA large text |
| Ember | lit / low-vision / onboarding | `#EB0000`–`#FF0000` | 4.5–5.3:1 | AA normal text |

NS-03 proves the ceiling holds in each mode; NS-06 proves the Dusk and Ember conformance numbers.

## 6. Correctness properties (extracted from requirements)

| Property test name | Requirement | What it proves |
|---|---|---|
| `NS-01 base ramp is pure red: G = B = 0` | NS-01 | pure red |
| `NS-02 base ramp is red-dominant (R >= 3*max(G,B))` | NS-02 | red dominance |
| `NS-03 no text token exceeds its mode luminance ceiling` | NS-03 | luminance budget |
| `NS-04 background is pure black in every mode` | NS-04 | no light mode |
| `NS-05 every semantic token resolves to a ramp colour` | NS-05 | no raw hex in components |
| `NS-06 Dusk ceiling >= 3:1 and Ember primary text >= 4.5:1 on black` | NS-06 | WCAG claims |
| `NS-07 contrast on black is monotone in red intensity` | NS-07 | helper correctness |
| `NS-08 parseHex rejects malformed colour strings` | NS-08 | fail-loud parser |

All eight pass today (`pnpm --filter @afterglow/design-system test`), plus a token-shape guard asserting all three modes expose an identical token set.

## 7. Future work (component layer)

- **Components** in `apps/mobile/src/**` / a `components` export: `Button`, `Tile`, `Tombstone`, `Candle`, `GhostRow`, `StatusLine`, `SourceChip`, `ModeSwitch`, `UnknownState`, etc. (design §6.4). Each consumes semantic tokens only; a Biome/lint rule forbids raw hex outside `theme.night.json`.
- **Playwright pixel scan**: screenshot every route in every mode; fail the build on any pixel above the mode ceiling (`night-vision.md` "When writing or reviewing UI"). The lux-meter MCP does the same for a running build when available.
- **Mode selection**: ambient-light driven with a two-tap manual pin; the Lights-Out moment always lands in Night (design §3.3).
- **Hook**: `luminance-on-token-save` runs the luminance property on any change to `theme.night.json` (architecture §15.6).
