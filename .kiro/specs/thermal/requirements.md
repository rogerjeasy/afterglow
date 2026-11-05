# Thermal — Requirements

**Module:** `packages/core/thermal`.
**Workflow:** Design-First (lumped-capacitance RC model is established physics).
**Spec name equals package name** per `structure.md`.

The Thermal module replaces timers with physics. It models a cold compartment (fridge, freezer, cold box) and a home as first-order lumped-capacitance systems warming toward ambient, and answers: what is the temperature at time t, when does it cross a threshold, and when do foods reach their discard point. Time constants are anchored to published guidance (USDA for appliances; NREL ResStock and regional archetypes for buildings) and refined by the household's own measured events. Every output records the model version so decisions can be replayed. Pure: no I/O.

## Glossary (this spec)

- **Lumped RC model** — `T(t) = T_amb + (T_0 − T_amb)·e^(−t/τ)`, where τ is the thermal time constant (minutes).
- **τ (tau)** — time constant; larger τ = slower warming. Appliance τ by class/fullness; building τ by archetype.
- **Ambient** — the surrounding temperature the body relaxes toward (room for a fridge; outdoor forecast for a home).
- **Crossing time** — the first time the modelled temperature reaches a danger threshold.
- **Door event** — an opening that injects a step toward ambient (compartment only).
- **Archetype** — a building class `{type, vintage, climate, insulation}` with a τ range.
- **Model version** — a string stamped on every output for replay/audit.

## Requirements

### TH-01 — The model is bounded and monotone toward ambient
**User story:** As a person trusting the fridge clock, I want the physics to be sane: the temperature only moves toward ambient and never overshoots.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL compute `temperatureAt(t)` so that for all `t ≥ 0` the value lies between `T_0` and `T_amb` (inclusive).
- WHEN `t2 > t1` THE SYSTEM SHALL return a temperature at `t2` that is at least as close to `T_amb` as at `t1` (monotone approach).
- WHERE `T_0 = T_amb` THE SYSTEM SHALL return `T_amb` for all `t`.

### TH-02 — Crossing time is correct and fail-closed
**User story:** As a person, I want the time the fridge crosses 4 °C to be the true model crossing, or an honest "never" when it cannot cross.

**Acceptance criteria (EARS):**
- WHEN the threshold lies strictly between `T_0` and `T_amb` THE SYSTEM SHALL return the exact crossing time `t = −τ·ln((T_amb − threshold)/(T_amb − T_0))`.
- IF the body is already past the threshold at `t = 0` THEN THE SYSTEM SHALL return crossing time 0.
- IF the threshold is on the far side of ambient (unreachable) THEN THE SYSTEM SHALL return `never`, not a guess.

### TH-03 — Door events add a step toward ambient and are order-independent
**User story:** As a person opening the fridge, I want each opening to warm it a little, and the result not to depend on the order I record openings.

**Acceptance criteria (EARS):**
- WHEN a door-open event of a given duration occurs THE SYSTEM SHALL raise the modelled temperature by a step toward ambient proportional to the open time, never past ambient.
- WHEN the same set of door events is applied in any order THE SYSTEM SHALL produce the same final temperature.

### TH-04 — Food discard times never exceed the source and start at the crossing
**User story:** As a person deciding on the chicken, I want the 4-hour perishable clock to start when the fridge actually crosses 4 °C, not at the outage, and never to be rounded up.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL start a perishable item's safety budget at the modelled crossing of its danger temperature, not at `t = 0`.
- THE SYSTEM SHALL compute `discardAt = crossingTime + budgetMinutes` and SHALL NOT extend the budget beyond its source value.
- WHERE the danger temperature is never crossed THE SYSTEM SHALL report the item as not yet at risk (no discard time), never "safe forever".

### TH-05 — Building model uses an archetype τ with an uncertainty band
**User story:** As a person planning the night, I want "home reaches 10 °C at about 03:40" with an honest band, not a false precision.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL select τ from the archetype table for the home's `{type, vintage, climate, insulation}`.
- THE SYSTEM SHALL return a crossing time together with a band derived from the archetype's τ range (`[τ_min, τ_max]`).
- WHERE no archetype matches THE SYSTEM SHALL return a wide default band and SHALL label it a default, never a point estimate (fail-closed.md rule 6).

### TH-06 — Every output is model-versioned
**User story:** As an auditor, I want to know which model produced a number so a past decision can be replayed exactly.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL stamp every temperature, crossing, and discard result with the model version string in force.

### TH-07 — Appliance τ reflects class and fullness, anchored to USDA guidance
**User story:** As a person, I want a full freezer to hold far longer than an open fridge, matching official guidance.

**Acceptance criteria (EARS):**
- THE SYSTEM SHALL provide default τ values such that a full freezer holds frozen roughly 48 h and a half-full freezer roughly 24 h, and an unopened fridge stays safe roughly 4 h, consistent with USDA guidance.
- WHERE the household has measured its own τ THE SYSTEM SHALL prefer the measured value over the default and SHALL record which was used.

## Analysis

- **Monotonicity (TH-01):** with τ > 0 and the exponential form, `temperatureAt` is monotone for both warming (`T_amb > T_0`) and cooling (`T_amb < T_0`); the "closer to ambient" phrasing covers both directions.
- **Crossing math (TH-02):** solvable in closed form; "reachable" means `threshold` is strictly between `T_0` and `T_amb`. The unreachable case returns `never` (fail closed).
- **Door-event order-independence (TH-03):** modelled by applying each step as a fraction of the remaining gap to ambient; because multiplicative gap-closing commutes, order does not matter. Documented as the chosen model.
- **USDA anchoring (TH-07):** τ is derived so the model reproduces USDA's rules of thumb at the reference ambient; the real per-class τ table lives in `data/` and is loaded by the module. Values and provenance recorded there.
- **Out of scope:** the ambient forecast feed (Open-Meteo/NOAA, Wave 4) and the FoodKeeper per-food budgets (the `foodkeeper` module); this module consumes a budget and an ambient series as inputs.
