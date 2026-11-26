# Guide (Wisp and the One Night tour) — Requirements

**Module:** `apps/mobile/src/guide/` (the script, the facts it may quote, the tour state machine) and the `Wisp` component.
**Workflow:** Requirements-First. The guide is a presentation layer over the existing demo space; it adds no verdict.
**Design source:** `docs/afterglow-design.md` §1 ("feel like a companion rather than a dashboard"), §7.3 (costume vocabulary), §8 (motion), §14.1 (voice), and the "Wisp" addendum in §14.1.

A first-time visitor (and every judge) meets Afterglow in a lit room, with no blackout to try it in. Today they land on forms. The guide fixes that: **Wisp**, a small ghost, walks them through one night without power in about ninety seconds (lights out, the Hearth, the Lantern map, a Séance message, the Graveyard Shift and the generator ward, and power back), inside the labelled demo space.

Wisp has a sense of humour. The product's voice rule (§14.1, "never cute during an emergency") still holds, so the humour has a fence: it lives only in Wisp's bubble, only in the demo, and never in a number. Wisp quotes the core; it never computes, rounds or invents.

## Glossary (this spec)

- **Wisp**: the guide character. Named after the will-o'-the-wisp, the ghost-light that leads travellers at night.
- **Step**: one stop on the tour: a tab, a target element on that tab, the power state the step needs, and a line.
- **Line**: Wisp's sentence for a step. A template with named **slots**, plus a **fallback** with no slots.
- **Facts**: the values a slot may be filled with, read from what the core already computed for the screen (the same view models the tiles use).
- **Power need**: the demo power state a step requires: `on`, `out` (an outage under way) or `back` (an outage that has ended).

## Requirements

### GD-01 — Wisp never invents a number
**User story:** As a person deciding what to throw out, I want every number I see to come from the model, including the ones a cartoon ghost says.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL write every line so that its only digits come from slots.
- WHEN a step is rendered THE SYSTEM SHALL fill each slot only from the facts.
- IF any slot a line needs has no fact THEN THE SYSTEM SHALL render the step's fallback line instead, AND the fallback SHALL contain no digit.
- THE SYSTEM SHALL NOT round, convert or recompute a fact. A slot shows the fact's text exactly as the screen shows it.

*Property:* `GD-01 every digit in a rendered line comes from a filled slot` (random facts, including missing ones). *Source:* `fail-closed.md`, AGENTS.md invariant 1.

### GD-02 — The guide is never on the verdict path
**User story:** As a reviewer, I want to prove the jokes cannot leak into a verdict.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL keep the guide in `apps/mobile/src/guide/`, imported only by the app shell (`App.tsx`) and the guide's own files.
- THE SYSTEM SHALL NOT import the guide from `packages/core`, any presenter (`*/present.ts`) or any screen.
- THE SYSTEM SHALL render Wisp's lines only inside Wisp's bubble.

*Property:* `GD-02 nothing outside the shell imports the guide` (a static import scan of the app source).

### GD-03 — The tour happens only in the demo
**User story:** As someone who has entered my real household, I want a tour never to write to it.

**Acceptance criteria (EARS):**
- WHEN the tour starts THE SYSTEM SHALL enter the demo space before the first step is shown.
- WHILE the tour runs THE SYSTEM SHALL apply power needs only to the demo store.
- IF the active space is not the demo THEN THE SYSTEM SHALL NOT apply any power need.
- WHEN the tour ends or is skipped THE SYSTEM SHALL leave the visitor in the demo, with its "Exit demo" control.

*Property:* `GD-03 reconcile acts only on the demo space`.

### GD-04 — The tour is a total state machine
**User story:** As a visitor tapping quickly, or with a keyboard, I want no sequence of taps to strand me.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL support `next`, `back`, `skip` and `restart` from every state.
- WHEN `back` is chosen on the first step THE SYSTEM SHALL stay on the first step.
- WHEN `next` is chosen on the last step THE SYSTEM SHALL finish the tour.
- WHEN `skip` is chosen THE SYSTEM SHALL finish the tour.
- WHILE the tour is finished, `next`, `back` and `skip` SHALL leave it finished; `restart` SHALL return to the first step.

*Property:* `GD-04 any sequence of actions lands in a valid state` (random action sequences).

### GD-05 — Power needs are reconciled idempotently
**User story:** As a visitor going back and forth between steps, I want the demo to be in the state each step describes.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL compute the action that brings the demo to a step's power need from the need and the current power state alone.
- WHEN the current power state already meets the need THE SYSTEM SHALL take no action.
- WHEN a step needs `out` THE SYSTEM SHALL start the outage at a fixed offset in the past (the tour's "evening"), so that every step sees the same night.
- WHEN a step needs `back` and no outage has run THE SYSTEM SHALL first start and then end one, so "power is back" is always true when said.

*Property:* `GD-05 applying the reconcile action meets the need, and a second reconcile does nothing`.

### GD-06 — The tour tells the whole night
**User story:** As a judge with three minutes, I want to see every part of the product in one pass.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL visit all five tabs (Hearth, Lantern, Séance, Cold, Plan).
- THE SYSTEM SHALL begin with power on and a lights-out step, AND SHALL end on the Hearth with the power back.
- THE SYSTEM SHALL name, for every step, a target element that exists on that step's tab.

*Properties:* `GD-06 the script visits every tab, starts with power on and ends with power back`; browser test `GD-06 every step's target is on screen and not covered by the bubble`.

### GD-07 — Wisp's body encodes progress
**User story:** As the design system, I want Wisp to obey the costume rule: a ghost is someone not yet fully heard from.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL draw Wisp at an opacity that rises with the tour's progress, from 0.35 on the first step to 1.0 on the last.
- THE SYSTEM SHALL keep the opacity non-decreasing as `next` is chosen.

*Property:* `GD-07 opacity is 0.35 at the start, 1.0 at the end, and never falls going forward`. *Source:* design §7.3 (Ghost: "Opacity 0.35 → 1.0 on check-in").

### GD-08 — Every line fits the bubble
**User story:** As a person reading on a 320 px phone at 200% text, I want Wisp to be short.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL keep every rendered line, with any facts, at or under 200 characters.
- THE SYSTEM SHALL keep the bubble inside the viewport at 320 px width with no horizontal overflow.

*Property:* `GD-08 every rendered line is at most 200 characters`; browser test `GD-08 no overflow at 320 px`.

### GD-09 — Wisp obeys night vision
**User story:** As a person in the dark, I want the guide to be as dim and red as everything else.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL draw Wisp, the bubble and the target highlight from semantic tokens only.
- THE SYSTEM SHALL pass the pixel scan with the tour open, in Night, Dusk and Ember.
- THE SYSTEM SHALL NOT give Wisp an ambient animation (`night-vision.md` rule 7); only its opacity changes, between steps.

*Browser test:* `GD-09 the tour passes the pixel scan in all three modes`. *Source:* `night-vision.md`, design §8.

### GD-10 — The tour is operable by everyone
**User story:** As a screen-reader or keyboard user, I want the tour to be as usable as it is for a sighted touch user.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL announce each line through a polite live region.
- THE SYSTEM SHALL give `Next`, `Back` and `Skip tour` targets of at least 44 px.
- WHEN Escape is pressed during the tour THE SYSTEM SHALL skip the tour.

*Browser test:* `GD-10 the tour runs by keyboard and Escape skips it`.

### GD-11 — The tour can be found and replayed
**User story:** As a first-time visitor (or a judge sent a link), I want one obvious way in.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL offer the tour on the onboarding welcome, on the Hearth when power is on, and in the You screen.
- WHEN the page is opened with `?tour=1` THE SYSTEM SHALL start the tour.
- THE SYSTEM SHALL allow the tour to be replayed any number of times.

*Browser test:* `GD-11 ?tour=1 starts the tour, and it can be replayed`.

## Analysis

- **Why a character at all, given "costume equals function"?** Wisp encodes the visitor's progress through the tour in its opacity (GD-07), using the same rule as the roster ghosts. It is also the only place the product is allowed to be funny, and that place is fenced (GD-01 to GD-03).
- **What the humour may joke about:** being a ghost, being scared of bright screens, the chicken. Never a specific risk to a specific person, never a medicine, and never a number.
- **Why the tour starts the outage in the past:** with an outage only seconds old the clocks are uninteresting and the map has not yet gone dark. A fixed 45-minute "evening" makes every visitor see the same night, so the demo video and a judge's own run match.
