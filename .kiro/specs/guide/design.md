# Guide (Wisp and the One Night tour) — Design

**Companion to:** `requirements.md` (this spec), `fail-closed.md`, `night-vision.md`, `docs/afterglow-design.md` §7.3, §8 and §14.1.
**Implements:** `apps/mobile/src/guide/`.

## 1. Overview

The guide is three pure pieces and one component:

```
apps/mobile/src/guide/
  script.ts                 the steps: tab, target, power need, line template, fallback
  tour.ts                   the state machine (GD-04), reconcile (GD-05), opacity (GD-07)
  render.ts                 fills a line from facts or falls back (GD-01, GD-08)
  facts.ts                  reads the facts from the household and Lantern view models
  Wisp.tsx                  the ghost, the bubble and the target highlight
  guide.property.test.ts    GD-01 .. GD-08 (pure)
apps/mobile/e2e/tour.e2e.ts GD-06, GD-08 .. GD-11 (browser)
```

`App.tsx` owns the tour state. On each step it (1) switches to the step's tab, (2) reconciles the power need against the demo store, and (3) renders `Wisp` with the filled line. Wisp then finds the target by its `data-tour` attribute, scrolls it into the free space above the bubble, and outlines it.

## 2. The script

| # | Tab | Target (`data-tour`) | Power | Line (slots in braces) |
|---|---|---|---|---|
| 0 | Hearth | `status` | on | Wisp introduces itself and offers to turn the lights off. |
| 1 | Hearth | `status` | out | `{devices}` phones in this cell lost power at once, so it is not just your fuse. |
| 2 | Hearth | `tile-fridge` | out | The fridge keeps food safe for `{fridge}` more, from USDA rules and a model of this fridge. |
| 3 | Hearth | `tile-people` | out | `{ghosts}` of your people have not been heard from yet. |
| 4 | Cold | `cold-first` | out | Every food gets its own clock; tap one. |
| 5 | Lantern | `lantern-map` | out | Lit squares still have power; a square needs at least `{k}` phones before it shows. |
| 6 | Lantern | `lantern-estimate` | out | The utility promised `{promise}`, usually runs late here, so the estimate is `{estimate}`. |
| 7 | Séance | `seance-simulate` | out | No signal: talk with light. Tap to watch the real decoder read a message. |
| 8 | Plan | `graveyard` | out | The home reaches `{threshold}` at about `{crossing}`; the headstone marks it. |
| 9 | Plan | `ward` | out | The generator ward refuses until every check is a yes. |
| 10 | Hearth | `status` | back | Power is back; `{foodVerdict}`. Wisp is now solid. |

Exact wording lives in `script.ts`; the property tests hold it to GD-01 and GD-08.

## 3. Facts

`facts.ts` exposes `readFacts(input): TourFacts`, a record of optional strings. Each fact is the *same text the screen shows*, taken from the same presenter:

| Fact | Source |
|---|---|
| `devices` | `cells.CellState.deviceCount` of the user's cell, when the cell is `dark` |
| `fridge` | `applianceTileText(a).value` for the first `fridge` appliance, when it is a clock |
| `ghosts` | count of roster members in state `ghost`, when the roster is non-empty |
| `k` | `cells.K_ANONYMITY` |
| `promise`, `estimate` | `formatClockTime` of the estimate's `promisedEndMinute` and `atMinute`, when `kind === 'estimate'` |
| `threshold`, `crossing` | `formatTemp(thresholdC)` and the Graveyard Shift's mid crossing clock, when there is a crossing |
| `foodVerdict` | `"nothing in the fridge needs a decision"` when no item needs attention, otherwise absent (the fallback then says to open Cold) |

A fact that is not computable is **absent**, never a default. The renderer then uses the fallback (GD-01).

## 4. State machine

```
type TourState = { kind: 'off' } | { kind: 'on'; index: number } | { kind: 'done' }
step(state, action, length) -> TourState     // total; GD-04
reconcile(need, power) -> 'startOutage' | 'endOutage' | 'cycle' | null   // GD-05
opacity(index, length) = 0.35 + 0.65 * index / (length - 1)              // GD-07
```

`power` is derived from the demo store: `on` (no outage, none ended this tour), `out` (an outage is running), `back` (no outage, and one ended during this tour). `cycle` means start and immediately end an outage, which only arises when a visitor jumps to the last step without passing through an outage.

`off` and `done` differ: `done` keeps the finish card ("Set up my own home" / "Keep exploring") until dismissed.

## 5. Wisp

- **Body:** a 56 px SVG ghost (head arc, wavy hem, two eyes) filled with `text.emphasis` at the GD-07 opacity, outlined in `focus.ring`. Eyes are `bg` cut-outs, so the ghost adds no new colour.
- **Bubble:** fixed above the tab bar, `surface.3` with a `hairline` border, max width 496 px, an `aside` landmark named for Wisp and the step (non-modal: the page stays usable), with the line in an `aria-live="polite"` region. Buttons: `Back` (secondary), `Next` (primary; its label is per-step, for example "Turn off the lights"), `Skip tour` (ghost).
- **Highlight:** the target gets a `tour-target` class: a 2 px `focus.ring` outline with a 4 px offset. No glow, no new colour.
- **Motion:** none ambient. `night-vision.md` rule 7 keeps the only ambient loop for the Hearth candle, so Wisp holds still (an earlier 4 px bob was removed under NS-17). Its body fades between steps in `motion.cross`.
- **Placement:** before the bubble appears, the target is scrolled to sit in the space between the header and the bubble, and the bubble's height is reserved as bottom padding so nothing is trapped under it.

## 6. Entry points

- Onboarding welcome: "Take the one-minute tour" (GD-11).
- Hearth with power on: a quiet "Show me a night with Wisp" link under the main buttons.
- You screen: "Replay the tour".
- `?tour=1`: starts the tour on load (used in the README link and the demo video).

## 7. Testing

- Pure properties (fast-check), `guide.property.test.ts`: GD-01, GD-02 (static scan of `src/`), GD-03..GD-08.
- Browser (Playwright), `e2e/tour.e2e.ts`: walk the whole tour at 390 px and 320 px; each target visible and not under the bubble; Escape skips; `?tour=1`; replay. `e2e/pixel-scan.e2e.ts` gains tour steps in all three modes (GD-09).
