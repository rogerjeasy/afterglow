---
name: night-vision-gate
description: Keep a dark-room, night-mode or red-light interface under a luminance ceiling and prove it. Use when choosing colours or theme tokens for a UI that is read in the dark, when reviewing a change to such a theme, or when checking screenshots for pixels that are too bright or not red.
license: Apache-2.0
compatibility: Node.js 22 or later for the bundled MCP server. The steps also work by hand without it.
---

# Night-vision gate

A screen read in the dark should not undo the reader's dark adaptation. The rules here make that measurable: every colour is red-only, sits on pure black, and stays at or below a luminance ceiling for the active mode. The gate is three checks, from cheapest to most complete. Run them in this order and stop at the first failure.

The full rules are in `references/night-vision.steering.md`. Copy that file into the project's `.kiro/steering/` so they apply to every change, not only when this skill is active.

## The numbers

- **Relative luminance** is the WCAG 2 formula: linearise each sRGB channel (`c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ^ 2.4`), then `L = 0.2126 R + 0.7152 G + 0.0722 B`.
- **Contrast on black** is `(L + 0.05) / 0.05`. On a pure black page the ceiling on L is the ceiling on contrast.
- **Red-only** means `R >= 3 x max(G, B)`. Pure red (`G = B = 0`) always passes.
- **Default ceilings** (change them in the theme if the project has measured its own):

| Mode | When | Text ceiling | L |
|---|---|---|---|
| `night` | below about 5 lux | `#A50000` | 0.080 |
| `dusk` | about 5 to 50 lux | `#B70000` | 0.101 |
| `ember` | lit room, low vision | `#FF0000` | 0.213 |

No rendered pixel may be brighter than the active mode's ceiling. Brightness is a budget: spend it on the one thing the reader must see first.

## Step 1: put every colour in one theme file

Raw hex lives in one file only. Components use semantic names (`text.primary`, `surface.1`, `focus.ring`), never hex. The tools read this shape (see `assets/theme.example.json`):

```json
{
  "ramp": { "red.000": "#000000", "red.700": "#A50000" },
  "textCeiling": { "night": "red.700" },
  "semantic": { "night": { "bg": "red.000", "text.primary": "red.700" } }
}
```

A semantic value is a ramp key or a raw `#RRGGBB`. Anything else is reported as unresolved, not guessed.

## Step 2: check candidate colours before using them

Call `luminance_check` with the colours and the mode:

```json
{ "colours": ["#A50000", "#A60000", "#7A2E00"], "mode": "night" }
```

Each colour comes back with its luminance, contrast on black, `redOnly`, `withinCeiling` and a verdict of `pass`, `fail` or `unknown`. `unknown` means the input was not a 6-digit hex colour; treat it as a fail. `allPass` is true only when every colour passes.

## Step 3: audit the theme

Call `token_audit` with the theme path, relative to the project root:

```json
{ "path": "src/theme/night.json" }
```

It lists every semantic token, in every mode, that is brighter than that mode's ceiling, is not red-only, does not resolve, or is a background (`bg`, `background`) that is not `#000000`. A mode with no ceiling is a violation. `ok: true` with an empty `violations` list is the only pass.

## Step 4: scan real screenshots

Tokens can pass while the rendered screen fails: an opacity stack, an image, a browser default focus ring or an anti-aliased edge can all add light. Capture each screen in each mode as a PNG (for example with Playwright, animations disabled) inside the project, then call `pixel_scan_png`:

```json
{ "path": "test-results/home-night.png", "mode": "night", "maxOffenders": 10 }
```

It returns `ok`, the number of offending pixels, the brightest red channel and the worst offenders with their coordinates and reason (`too bright` or `not red`). Channels of 2 or less are treated as rendering noise. Fix the cause, re-capture and scan again.

## Fixing a failure

- Too bright: move the token down the ramp. Do not dim with opacity; opacity over a brighter colour still renders that colour's hue and is hard to audit.
- Not red: find the source (a default focus ring, a grey border, an image, an emoji, a shadow) and replace it with a ramp token. There is no grey in a red-only UI.
- Hard to read at the ceiling: make it larger or heavier, not brighter. At night, body text of at least 20 px at weight 600 reads better than brighter small text.
- Meaning must survive one hue: carry state with size, shape, position, pattern and words, never with a second colour.

## Rules for the agent

- Never claim a screen passes without a scan result that says `ok: true` for that mode.
- A refused call (path outside the project, not a PNG, not a theme) is not a pass. Report it and stop.
- Do not widen a ceiling to make a check pass. A ceiling changes only with a reason the user agrees to.
- If the MCP tools are not available, compute luminance with the formula above and say that the result was computed by hand.
