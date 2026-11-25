# Energy (Candles) — Requirements

**Module:** `packages/core/src/energy` (pure planner; no I/O, no timers, no randomness).
**Workflow:** Requirements-First (product driven; the priority order comes from the product spec 7.8).
**Spec name equals package name** per `structure.md`.

Every store of energy is a candle. The planner says which load each candle should carry, for how long, and what it cannot carry. It never invents a capacity: a store with no stated capacity is left out and said so. It is deterministic, and the same stores and loads give the same plan in any order.

## Glossary (this spec)
- **Store** — `{ id, name, kind, capacityWh, chargePct, ac, usableFraction? }`. `ac` says whether it has a mains-style outlet; every store is assumed to have USB.
- **Load** — `{ id, name, watts, class, needs, drawsFrom? }`. `class` is medical, communication, light, food or comfort (in that priority). `needs` is `usb` or `ac`. `drawsFrom` pins a load to one store (a phone running on its own battery).
- **Usable energy** — `capacityWh × chargePct/100 × usableFraction`. The usable fraction is a **planning default** per kind unless the user sets one, and every plan lists the defaults it used.
- **Horizon** — the hours the plan must cover (until dawn, until the schedule says power returns).
- **Status** — `covered` (the load runs the whole horizon), `partial` (it runs for a stated time), `unsupplied` (no compatible energy).

## Requirements

### EN-01 — The plan is deterministic and order-independent
- THE SYSTEM SHALL return the same plan for the same stores, loads and horizon in any order of the inputs.

### EN-02 — Energy is conserved
- THE SYSTEM SHALL NOT draw more from a store than its usable energy, and SHALL report for each store `usedWh + remainingWh = usableWh`.
- THE SYSTEM SHALL report each load's `allocatedWh` as the sum of what it draws from stores, and `runtimeHours = min(horizon, allocatedWh / watts)`.

### EN-03 — Priority is respected
- THE SYSTEM SHALL serve loads in the order medical, communication, light, food, comfort, then by id, and a load SHALL only draw energy that no higher-priority load took.
- Removing every lower-priority load SHALL NOT change what a higher-priority load receives.

### EN-04 — Medical loads are never reported as covered unless they are
- THE SYSTEM SHALL report a medical load `covered` only when it runs for the whole horizon, and otherwise `partial` or `unsupplied` with the hours it will run and the plain sentence that it cannot be sustained.
- WHERE one store can carry a medical load for the whole horizon THE SYSTEM SHALL use a single store for it, to avoid a swap in the night.

### EN-05 — Outlets are respected
- THE SYSTEM SHALL NOT draw an `ac` load from a store without an AC outlet, and SHALL NOT draw a pinned load from any store but its own.
- THE SYSTEM SHALL NOT let an unpinned load draw from a phone's own battery.

### EN-06 — Unknown is a first-class answer
- IF a store has a non-finite or non-positive capacity, a charge outside 0 to 100, or a duplicate or empty id THEN THE SYSTEM SHALL leave it out and list it with the reason.
- IF a load has non-finite or non-positive watts, an unknown class or need, or a duplicate or empty id THEN THE SYSTEM SHALL leave it out and list it with the reason.
- IF the horizon is not a number from 0.25 to 168 hours THEN THE SYSTEM SHALL return no plan and say why.

### EN-07 — More charge never covers less
- FOR any store, raising its charge SHALL NOT reduce the total runtime hours of the whole plan, and SHALL NOT turn a covered load into a partial one.

### EN-08 — Every plan is labelled
- THE SYSTEM SHALL attach the model version and the list of planning defaults in use (the usable fractions and the generator fuel figure), and SHALL show them so a default is never silent.

### EN-09 — Unit helpers refuse nonsense
- THE SYSTEM SHALL convert milliamp-hours to watt-hours at a stated voltage (3.7 V default, labelled) and generator fuel to watt-hours at a stated litres-per-kWh, and SHALL return no number for non-finite or non-positive input.

## Analysis
- **Defaults are Afterglow's, not a manufacturer's.** The usable fractions (power bank 0.85, laptop 0.8, car 0.3, home battery 0.9, UPS 0.8, generator 1.0, phone 0.9) are conservative planning defaults, labelled as such in every plan. They are not measurements of any product. The car default is low on purpose so the plan does not drain a starting battery. A user who knows better overrides it.
- **No device table yet.** The product spec mentions defaults from a public device table for unknown capacities. There is no such table in the repository, so an unknown capacity is left out (EN-06) and the screen asks for it. That is honest and costs only one number from the user.
- **Assumptions the plan states:** all stores offer USB; only stores marked `ac` can run an AC load; a phone store runs only the loads pinned to it; loads run continuously for the whole horizon. Real devices cycle (a fridge, a CPAP) and conversion losses vary, so the plan is an estimate and says so.
- **Not covered:** schedule-aware "bank before the window" advice, solar yield, and measured draw from smart plugs. All three need data adapters (Waves 3 and 4).
