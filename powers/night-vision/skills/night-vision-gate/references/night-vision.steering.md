---
inclusion: auto
name: night-vision
description: Night-vision rules for interfaces read in the dark (night mode, red-light mode, astronomy, cockpit, bedside or blackout screens). Use when creating, changing or reviewing colours, theme tokens, components or screenshots of such an interface.
---

# Night vision

This interface is read in the dark. Its job is to be readable without destroying the reader's dark adaptation. Luminance is a budget, and colour is fixed to one hue.

Copy this file into `.kiro/steering/` of the project. Change the ceilings only if the project has measured its own, and write down why.

## Rules

1. **Pure black background, no light mode.** The page, every screen and every shared image render on `#000000`.
2. **One hue: red.** Every colour satisfies `R >= 3 x max(G, B)`. Meaning is carried by luminance, size, shape, position, pattern and words, never by a second hue. An amber variant for red colour blindness may use the same luminance ceilings.
3. **A luminance ceiling per mode.** WCAG relative luminance of any rendered pixel stays at or below the active mode's text ceiling:
   - `night` (below about 5 lux): `#A50000`, L = 0.080.
   - `dusk` (about 5 to 50 lux): `#B70000`, L = 0.101.
   - `ember` (lit room, low vision): up to `#FF0000`, L = 0.213.
   The mode follows ambient light and the user can always override it.
4. **Semantic tokens only.** Components use semantic token names. Raw hex appears only in the one theme file. No ad-hoc colours, no grey, no opacity tricks to brighten or dim.
5. **Readable at the ceiling.** When text is hard to read, make it larger or heavier, not brighter. No thin strokes; minimum touch target 44 px.
6. **Depth without light.** Use surface tiers and hairlines, never shadows or glows brighter than the surface tiers.
7. **Motion is quiet.** Animate only `transform` and `opacity`; respect reduced motion; no flashing.
8. **Every state is designed.** Loading, empty, offline, unknown, error and permission denied all follow these rules too.

## The gate

A change that touches colour is done only when all three pass for every mode:

1. `luminance_check` on any new colour.
2. `token_audit` on the theme file: `ok: true`, no violations.
3. `pixel_scan_png` on a screenshot of each changed screen: `ok: true`.

A refused or `unknown` result is not a pass. Never report a screen as compliant without a scan result for it.
