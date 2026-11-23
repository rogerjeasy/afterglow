# Night Shell — Requirements

**Module:** `packages/design-system` (tokens and the luminance guards) and, later, the Night Shell components in `apps/mobile/src/**`.
**Workflow:** Requirements-First. The Night Shell is a product-driven design surface; its visual contract is fixed by `docs/afterglow-design.md`, and these requirements turn that contract into testable properties.
**Spec name equals package name** per `structure.md`.

The Night Shell is the interface layer everything renders through. Afterglow is opened in the dark, so the UI is red-only on pure black and luminance is a budget. This spec covers the **token system and its luminance guarantees** (implemented) and states the **component-level rules** (future) so the contract is fixed.

## Glossary (this spec)

- **Ramp** — the base set of red colours (`red.000` … `red.1000`), the only place raw hex is allowed.
- **Semantic token** — a named role components consume (`text.primary`, `surface.2`, `focus.ring`), resolved to a ramp colour per mode.
- **Mode** — one of three luminance modes: `night` (≤~5 lux), `dusk` (~5–50 lux), `ember` (lit room, low vision, onboarding, consoles).
- **Text ceiling** — the brightest ramp colour a text/icon token may reach in a given mode.
- **Relative luminance (L)** / **contrast ratio (CR)** — the WCAG quantities; on pure black `CR = (L + 0.05) / 0.05`.

## Requirements

### NS-01 — The base ramp is pure red
**User story:** As a person preserving night vision, I want the interface to use only long-wavelength red so my scotopic vision survives.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL define every base-ramp colour with green and blue channels equal to zero.
- THE SYSTEM SHALL NOT introduce grey, white, or any non-red hue into the consumer ramp.

*Property:* `NS-01 base ramp is pure red: G = B = 0`. *Source:* `night-vision.md` rule 2.

### NS-02 — The ramp is red-dominant
**User story:** As a colour-blind user and as a night-vision user, I want meaning carried by luminance and shape, never by a hue that could drift toward another colour.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL ensure every ramp colour satisfies `R >= 3 * max(G, B)`.

*Property:* `NS-02 base ramp is red-dominant (R >= 3*max(G,B))`. *Source:* design §16 (the luminance property). The amber protanopia variant is a separate hue and is exempt from this red-dominance rule by design.

### NS-03 — No text token exceeds its mode's luminance ceiling
**User story:** As a person in a blackout, I want no pixel bright enough to blind me or burn battery beyond what the mode allows.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL ensure no text- or icon-carrying semantic token in a mode has relative luminance above that mode's text ceiling.
- Night ceiling SHALL be `red.700` (L 8%), Dusk `red.800` (L 10%), Ember `red.1000` (L ~21%).

*Property:* `NS-03 no text token exceeds its mode luminance ceiling`. *Source:* `night-vision.md` rule 3.

### NS-04 — There is no light mode
**User story:** As a person whose night has gone wrong, I want the app to never flash a white screen.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL render the background as pure black (`#000000`) in every consumer mode.
- THE SYSTEM SHALL NOT offer a light mode in the consumer app.
- WHERE a screenshot or share is produced THE SYSTEM SHALL render it on black.

*Property:* `NS-04 background is pure black in every mode`. *Source:* `night-vision.md` rule 1. (The Beacon "Daylight operations" theme and print are the only two documented exceptions and are out of scope for the consumer token set.)

### NS-05 — Components consume semantic tokens only
**User story:** As a reviewer, I want to reject any raw colour in a component so the luminance budget can never be bypassed.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL expose colour to components only through semantic tokens.
- THE SYSTEM SHALL ensure every semantic token in every mode resolves to a colour that exists in the base ramp.
- THE SYSTEM SHALL confine raw hex values to `theme.night.json`.

*Property:* `NS-05 every semantic token resolves to a ramp colour`. *Source:* `night-vision.md` rule 4.

### NS-06 — Documented WCAG conformance holds
**User story:** As an accessibility auditor, I want the Dusk and Ember claims to be true numbers, not aspirations.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL ensure the Dusk text ceiling reaches at least 3.0:1 contrast on black (WCAG AA large text).
- THE SYSTEM SHALL ensure Ember primary text reaches at least 4.5:1 contrast on black (WCAG AA normal text).
- THE SYSTEM SHALL disclose that Night is a night-vision instrument mode that does not meet 4.5:1, with the numbers published in the trust centre.

*Property:* `NS-06 Dusk ceiling >= 3:1 and Ember primary text >= 4.5:1 on black`. *Source:* design §3.2.

### NS-07 — Luminance is monotone in red intensity
**User story:** As an engineer, I want the luminance helper to be correct so the ceiling checks are trustworthy.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL ensure contrast-on-black never decreases as the red channel increases.

*Property:* `NS-07 contrast on black is monotone in red intensity`.

### NS-08 — The colour parser rejects malformed input
**User story:** As an engineer, I want a bad colour string to fail loudly, not silently resolve to black.

**Acceptance criteria (EARS):**
- IF a colour string is not a 6-digit `#RRGGBB` hex THEN THE SYSTEM SHALL throw rather than return a value.

*Property:* `NS-08 parseHex rejects malformed colour strings`.

### NS-10 — No rendered pixel exceeds the active mode's ceiling
**User story:** As a person in a blackout, I want what is actually painted, not just what the tokens say, to stay under the luminance budget.
- THE SYSTEM SHALL fail the scan of any screenshot that contains a pixel whose red channel exceeds the active mode's text ceiling (Night `#A5`, Dusk `#B7`, Ember `#FF`).
- THE SYSTEM SHALL allow a pixel exactly at the ceiling.
- THE SYSTEM SHALL scan every route in every mode, and the outage state, in the browser (Playwright harness, `apps/mobile/e2e`).
*Property:* `NS-10` in `packages/design-system/src/pixelScan.property.test.ts`. *Source:* `night-vision.md` rule 3, design section 16.

### NS-11 — Every visible pixel is red-dominant
- THE SYSTEM SHALL fail any pixel with `R < 3 * max(G, B)` when `max(G, B)` exceeds a rendering-noise floor of 2.
- THE SYSTEM SHALL pass any pixel at or under the ceiling with `R >= 3 * max(G, B)`.
*Property:* `NS-11`. *Source:* NS-02 and `night-vision.md` rule 2, applied to rendered pixels.

### NS-12 — The scan fails closed
- IF the buffer length does not match the stated width and height, or the size is not a positive whole number, THEN THE SYSTEM SHALL report failure.
- THE SYSTEM SHALL ignore alpha and SHALL count every offender while reporting only the first few.
*Property:* `NS-12`.

### NS-09 — Type, motion, depth, and states (future, component layer)
**User story:** As a person under stress in the dark, I want large calm type, one primary action, and a designed state for every situation including "unknown".

**Acceptance criteria (EARS):**
- Night/Dusk body text SHALL be at least 20 px at weight 600 (Dusk ≥19 px/700), with +2% letter-spacing and no thin strokes.
- THE SYSTEM SHALL animate only `transform` and `opacity`; ambient animation SHALL be limited to the Hearth candle flame at ≤6% luminance variance; tabs SHALL NOT slide.
- THE SYSTEM SHALL derive depth from surface tiers, hairlines, and the ember edge, never shadows.
- THE SYSTEM SHALL design every screen's loading, empty, offline, unknown, error, permission-denied, first-run, and success states.
- Durations SHALL be written "3 h 10 m", never "3:10"; text carrying a number or a source SHALL NOT be ellipsised.

*Status:* deferred to the component and Playwright-pixel-scan tasks; stated here so the contract is fixed. *Source:* `night-vision.md` rules 6–12.

## Analysis

- **The central tension** (design §3.1): a red under the 8% Night ceiling can reach at most 2.6:1 on black, below WCAG AA. Resolved by shipping three modes — Night is a disclosed instrument mode; Dusk meets AA large text; Ember meets AA normal text. NS-03 and NS-06 encode both halves of this.
- **Text tokens vs non-text tokens:** only text/icon tokens are bound by the text ceiling (NS-03). Dimmer reds are reserved for non-text elements (hairlines, muted rules), where WCAG's 3:1 non-text rule applies. The `TEXT_TOKENS` list fixes which tokens the ceiling check covers.
- **Amber scope:** the amber ramp exists for protanopia at identical luminance stops but is a different hue, so NS-02 (red-dominance) is asserted only on the red ramp.
