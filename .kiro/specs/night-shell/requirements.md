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

## Design pass (2026-11-26): calm screens that still show their working

The screens were correct but read like an engineering console: model ids and sense names in the main copy, three or four source chips under every number, every form open at once. Cold reached 4,943 px and Plan 5,229 px on a 390 px phone in the demo outage. These requirements make the screens calm without hiding anything a person is owed.

### NS-13 — Sources open on a tap, and a default is never hidden
**User story:** As a person in the dark, I want the number first and its working one tap away, without losing the fact that a default was used.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL show, next to every sourced number, one source control whose closed label is "How I know".
- WHERE any of the sources is a default THE SYSTEM SHALL add "uses defaults" to the closed label.
- WHEN the control is opened THE SYSTEM SHALL list every source, with its model version, in the order given, plus any link and detail lines.
- THE SYSTEM SHALL expose the control as a button with `aria-expanded`, at least 44 px tall.

*Property:* `NS-13 the closed label names defaults whenever one is used, and the open list keeps every source in order`. *Source:* `fail-closed.md` rules 6 and 9; design §8.3 ("Source chip: tap expands inline").

### NS-14 — Plain words first
**User story:** As a person who is not an engineer, I want the main text in words I use.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL NOT show model identifiers (such as `thermal-appliance-v2`), sense identifiers (such as `chargingEdge`) or the words "fusion core" in visible text outside an opened source control.
- THE SYSTEM SHALL say how the power state is known in a plain sentence (for example, "This phone stopped charging and the mains hum went quiet").

*Properties:* `NS-14 sense words cover every sense and verdict, in plain words`; browser test `NS-14 no engine identifiers in visible text on any screen`.

### NS-15 — One screen, one job: rows and forms fold
**User story:** As a person under stress, I want each screen to answer its question before I have to scroll past forms I am not using.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL keep add-forms (a battery, a load, a person) closed until asked for, behind one button that names the action.
- THE SYSTEM SHALL keep per-item management (remove, details) out of a list row until the row or its list is opened for editing; a decision the person must make now (for example, "Ice crystals remain?") SHALL stay visible.
- THE SYSTEM SHALL keep each screen, in the demo outage at 390 px, within a height budget: Hearth 1,950 px, Lantern 2,400 px, Séance 2,450 px, Cold 3,400 px, Plan 4,000 px.

*Browser test:* `NS-15 every screen fits its height budget in the demo outage`. The budgets are the measured result plus about 5%, to stop regressions. They are not aspirational. Before and after this pass: Hearth 1,945 → 1,863; Séance 3,117 → 2,358; Cold 4,943 → 3,261; Plan 5,229 → 3,883; Lantern 2,392 → 2,287. Plan stays the longest on purpose: the four carbon-monoxide checks of the generator ward stay open, because folding a safety question to save scrolling is the wrong trade.

### NS-16 — The costume carries the data
**User story:** As the design system, I want each metaphor to encode its measurement where people look first.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL draw cold compartments on the Hearth as tombstones, the same component and the same darkening as on Cold.
- THE SYSTEM SHALL draw each roster member as a ghost at 0.35 opacity until heard from since the outage began, and at full opacity once heard (design §7.3).

*Browser test:* `NS-16 Hearth compartments are tombstones and ghosts solidify when heard`.

### NS-17 — No ambient loop except the candle
**User story:** As a person whose eyes have adjusted, I want nothing on screen to move for its own sake.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL run no infinitely repeating animation, on any screen or in the guide, other than the Hearth candle flame (not yet built).

*Browser test:* `NS-17 no infinite animation on any screen or in the tour`. *Source:* `night-vision.md` rule 7. This removed the guide's bob (guide design §5 was written against the design doc's ambient budget and missed the steering rule).

## Amber variant (NS-18..NS-22)

Design 3.4 promises an Amber variant for protanopia (about one man in a hundred sees deep red as very dark), at the same luminance tiers, chosen in Settings, with red the default. The ramp existed in `theme.night.json` but nothing resolved to it and nothing let a person choose it. These requirements make the promise true.

### NS-18 — Amber stays under the same ceilings
**User story:** As a person with protanopia, I want a colour I can read that costs no more of the luminance budget than red does.

**Acceptance criteria (EARS):**
- WHILE the amber hue is chosen THE SYSTEM SHALL resolve every semantic token to an amber ramp colour whose relative luminance is at or under the active mode's text ceiling (the red ceiling: Night `red.700`, Dusk `red.800`, Ember `red.1000`).
- THE SYSTEM SHALL keep the mapping from each red step to its amber stand-in in `theme.night.json` (`amberFor`), and raw amber hex only there.

*Properties:* `NS-18 amber: no amber text token exceeds its mode luminance ceiling`, `NS-18 amber: no amber token of any kind exceeds its mode ceiling`.

### NS-19 — Amber is one hue and covers every token
**Acceptance criteria (EARS):**
- THE SYSTEM SHALL give every red ramp step an amber stand-in, so every semantic token in every mode resolves into the amber ramp, and the background stays `#000000`.
- THE SYSTEM SHALL keep every amber ramp colour at blue 0 and green between 0.5 and 0.6 of red, rising in luminance step by step.

*Properties:* `NS-19 amber: every red step has an amber stand-in, and every token resolves into the amber ramp`; `NS-19 amber: the amber ramp is one hue (B = 0, G/R between 0.5 and 0.6) and rises in luminance`.

### NS-20 — Amber keeps the tiers and the WCAG claims
**Acceptance criteria (EARS):**
- THE SYSTEM SHALL keep the order of every pair of semantic tokens by luminance the same in amber as in red, in every mode.
- From `red.200` up, THE SYSTEM SHALL keep each amber stand-in within 7% of the red step's luminance.
- WHERE a red text token meets the documented WCAG level (Dusk 3:1, Ember 4.5:1) THE SYSTEM SHALL ensure its amber token meets it too.

*Properties:* `NS-20 amber: the tiers keep their order ...`, `NS-20 amber: from red.200 up ...`, `NS-20 amber: wherever a red token meets the documented WCAG level ...`.

### NS-21 — The pixel scan covers amber
**Acceptance criteria (EARS):**
- THE SYSTEM SHALL scan every route in every mode in amber, against the same ceilings, measured as relative luminance (amber carries green, so the red channel alone does not measure it).
- WHILE scanning amber THE SYSTEM SHALL fail any pixel greener than the amber ramp's own hue (allowing the noise floor of 2) or with `R < 3 * B` above the noise floor, and SHALL pass pure red at or under the ceiling.
- The red scan (NS-11) SHALL stay as it is: it rejects amber, which is not red-dominant.

*Properties:* `NS-21 amber scan: ...` (4) in `packages/design-system/src/amber.property.test.ts`. *Browser tests:* `NS-21 amber <route> stays within the <mode> ceiling and amber` (25 routes x 3 modes) and `NS-21 the amber scan really sees a bright pixel and a green one`, in `apps/mobile/e2e/pixel-scan.e2e.ts`.

### NS-22 — The person chooses the colour, and it holds from the first frame
**User story:** As a person with protanopia, I want to choose amber once and never be shown deep red again on this phone.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL offer a "Colour" setting on the You screen with two options, "Red (best for night vision)" and "Amber (easier with red colour blindness)", red by default, and SHALL state there that amber costs night vision a little more than red.
- WHEN the person chooses a colour THE SYSTEM SHALL repaint at once without changing the luminance mode, and SHALL remember the choice on this device (`afterglow.hue.v1`).
- WHEN the app or site loads with amber remembered THE SYSTEM SHALL paint amber from the first frame with content, in the app, the public site and the sign-in pages.
- WHERE the phone is used as a light or a Heliograph lamp THE SYSTEM SHALL use the chosen colour, since both paint the `text.emphasis` token; the Heliograph codec is unchanged.

*Browser test:* `NS-22 amber is chosen on You, persists across a reload, and applies before paint` in `apps/mobile/e2e/hue.e2e.ts`.

## Analysis

- **The central tension** (design §3.1): a red under the 8% Night ceiling can reach at most 2.6:1 on black, below WCAG AA. Resolved by shipping three modes — Night is a disclosed instrument mode; Dusk meets AA large text; Ember meets AA normal text. NS-03 and NS-06 encode both halves of this.
- **Text tokens vs non-text tokens:** only text/icon tokens are bound by the text ceiling (NS-03). Dimmer reds are reserved for non-text elements (hairlines, muted rules), where WCAG's 3:1 non-text rule applies. The `TEXT_TOKENS` list fixes which tokens the ceiling check covers.
- **Amber scope:** the amber ramp exists for protanopia at identical luminance stops but is a different hue, so NS-02 (red-dominance) is asserted only on the red ramp. NS-18..NS-22 give amber its own guards: the same ceilings, its own hue rule, and a scan of every route.

## The ghost turns solid (NS-23)

### NS-23 — A ghost materialises once, when someone is heard from
**User story:** As someone waiting in the dark for word from my mother, I want the moment she checks in to be unmistakable, without the screen getting brighter or busier the rest of the night.

**Acceptance criteria (EARS):**
- WHEN a person's ghost changes from faint (not heard from) to solid while it is on screen THE SYSTEM SHALL play one materialise moment of at most 900 ms: the ghost rises and settles, its fill fades in, and one ring ripples outward and fades.
- THE SYSTEM SHALL NOT play it on first render, so a list that opens already solid stays still, and SHALL NOT loop it; the Hearth candle stays the only ambient loop (rule 7).
- THE SYSTEM SHALL animate only `transform` and `opacity`, and SHALL draw every frame from the `text.emphasis`, `nontext.muted` and `bg` tokens, so no frame can pass the active mode's ceiling.
- WHILE reduced motion is requested THE SYSTEM SHALL drop the rise and the ring and keep only a short fade of the fill, which explains the change.
- The same glyph is the guide, Wisp, so the tour's last step ("I'm solid now") uses the same moment.
