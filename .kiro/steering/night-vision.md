---
inclusion: always
---

# Invariant: night vision

Afterglow is opened in the dark. The consumer UI is red-only on pure black, and luminance is a budget. The canonical definition of modes, token values, type scale and motion is the design document:

#[[file:docs/afterglow-design.md]]

Once `packages/design-system/theme.night.json` exists it becomes the single source of colour values. At that point, add a file reference to it in this document so the agent reads the real table instead of the prose.

## Rules
1. **There is no light mode in the consumer app.** Background is pure black. Screenshots and shares render on black.
2. **One hue: red** (amber is the protanopia variant at the same luminance tiers). Meaning is carried by luminance, size, shape, position, pattern and words, never by hue. Alerts use size, pulse and pattern.
3. **Three luminance modes**, chosen by ambient light and always user-overridable:
   - Night (default below about 5 lux): text ceiling `#A50000` (relative luminance 8%).
   - Dusk (about 5 to 50 lux): ceiling `#B70000` (10%); all text is WCAG large text.
   - Ember (lit room, low vision, onboarding, consoles): text from `#EB0000` up to `#FF0000`; meets AA for normal text.
   No rendered pixel may exceed the active mode's ceiling for its token tier.
4. **Semantic tokens only.** Components consume semantic tokens (`text.primary`, `surface.2`, `focus.ring`). Raw hex values appear only in `theme.night.json`. No ad-hoc colours, opacity tricks to brighten, or grey.
5. **Exceptions are exactly two**: the Beacon "Daylight operations" theme (operators in lit control rooms; never offered in the consumer app) and print materials. The Lights-Out moment always lands in Night.
6. **Type in the dark**: Night and Dusk body text at least 20 px at weight 600 (Dusk text at least 19 px at weight 700), +2% letter-spacing, no thin strokes, no small caps. Caption minimum anywhere is 16 px. Minimum targets 44 px, with 56 px and 72 px for primary actions. Durations are written "3 h 10 m", not "3:10". Text carrying a number or a source is never ellipsised.
7. **Motion**: animate only `transform` and `opacity`. Ambient animation is limited to the Hearth candle flame (at most 6% luminance variance). Reduced motion removes translation, scale and ambient loops. Tabs never slide.
8. **Depth** comes from surface tiers, hairlines and the ember edge, never shadows.
9. **Icons**: Lantern Icons (24 px grid, 2 px stroke). No emoji anywhere. Illustration only where it carries data.
10. **Web** cannot set hardware brightness, so the shell dims with a full-screen overlay.
11. **Every screen designs all its states**: loading, empty, offline, unknown, error, permission denied, first run, success.
12. **Haptics are a grammar**, always paired with a visual: one long = outage, two short = restoration, three = HELP received. Sound is off by default.

## When writing or reviewing UI
- The luminance property test on `theme.night.json` and the Playwright pixel scan of every route must pass. Measure with the lux-meter MCP when it is available instead of estimating.
- Reject a change that introduces a white or light surface, a non-red hue, a raw hex in a component, a layout animation, or a state with no design.
- Night Watch rejects non-red pixels, unsourced numbers and AI calls on the verdict path.
