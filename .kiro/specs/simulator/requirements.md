# Simulator — Requirements

**Package:** `tools/simulator` (`@afterglow/simulator`).
**Workflow:** Quick Spec (the shape is fixed: one seeded function).
**Spec name equals package name** per `structure.md`.

The virtual neighbourhood that drives demos, tests and chaos drills (architecture 14.1). Given a seed it produces a grid of geohash-6 cells, a population of devices per cell, the reports those devices would send through an outage and a restoration, the provider's promise, and the utility's overrun history. The app runs these through the **real** `cells` and `restoration` core, so the demo exercises the product's actual k-anonymity and estimation, not a hard-coded picture.

It is simulation, always labelled as simulation in the UI. It never reads or writes real data and has no I/O: a pure function of its config.

## Requirements

### SIM-01 — Deterministic
- THE SYSTEM SHALL return identical output for identical config.
- THE SYSTEM SHALL return different output for a different seed.

### SIM-02 — Output carries no more than the real thing
- THE SYSTEM SHALL emit reports with exactly the `CellReport` fields, each at most 200 bytes serialised.
- THE SYSTEM SHALL emit location only as a geohash-6, and device ids that are opaque (no coordinates, no names).
- THE SYSTEM SHALL emit senses only from the known set (`ce`, `hum`, `fl`, `mag`, `tel`).

### SIM-03 — Re-confirmation while a verdict holds (assumption Q1)
- WHILE a device's verdict holds THE SYSTEM SHALL emit a report for that device at least every 20 minutes, with the same fields.
- This is an assumption pending privacy review; see the Q1 note in `.kiro/specs/cells/requirements.md`. The kernel in core is unchanged either way.

### SIM-04 — The scenario exercises every state through the real core
- THE SYSTEM SHALL produce a user's cell that runs, through `cellTimeline`, from lit to dark to coming back to lit.
- THE SYSTEM SHALL include at least one cell with fewer than k devices, which `cellTimeline` never publishes as anything but `unknown`.
- THE SYSTEM SHALL include at least one cell that stays lit through the whole outage.

### SIM-05 — The grid is a grid
- THE SYSTEM SHALL return `cols × rows` distinct, valid geohash-6 cells, laid out so that adjacent `col`/`row` indices are adjacent cells (their bounds touch).

### SIM-06 — The provider and the history are plausible and honest
- THE SYSTEM SHALL promise an end after the outage starts, and return at least `MIN_HISTORY` past outages so that the core can draw a band.
- THE SYSTEM SHALL make the true restoration time a draw from the same overrun distribution as the history, not a value chosen to flatter the estimate.

## Analysis

- **Why a package and not a demo file:** the architecture names `tools/simulator` as the driver for demos, tests and chaos drills. The same function will feed the monthly metro-blackout drill (Wave 6.11) at larger scale; the grid size and device counts are parameters for that reason.
- **Not evidence:** the UI labels everything from this package "simulated". Nothing here can be mistaken for crowd data: outside the demo space the app has no neighbourhood at all and says so.
