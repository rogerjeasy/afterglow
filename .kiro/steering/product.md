---
inclusion: always
---

# Product: Afterglow

Afterglow is the blackout companion for people who live with unreliable electricity. Tagline: "The only app you can read when the grid dies." It turns phones into grid sensors, flashlights into messengers, and fridges, medicines, homes and batteries into physics models, so people in the dark know what is still safe, who is okay, where the lights still are, and when power returns.

Built for Kiroween 2026, Costume Contest category. In this product the spooky costume is always a measurement: candle = energy store, tombstone = cold compartment, ghost = roster member not yet heard from, lantern map = where mains exists, ward = refused unsafe action. A metaphor that encodes no data gets cut.

The full specification (personas, every feature module, surfaces and non-goals) is in `docs/afterglow-project-description.md`; the `product-reference` steering file loads it when a request is about product scope.

## Product family
One shared core, design system and privacy model behind five surfaces. Built today: Afterglow (web PWA), Voice (USSD and SMS endpoints), Business and Beacon (consoles in the app), and the public API. Planned: native Android and iOS, IVR, SDKs and open-data exports.

## Principles to apply when making product decisions
1. Deterministic core. Every verdict comes from deterministic code with citable inputs. AI proposes, translates or audits; it never decides.
2. Fail closed. "Unknown" is a first-class answer.
3. Offline first. Safety modules must work with no connectivity.
4. Dark first. There is no light mode in the consumer app.
5. Safety is free. Anything a person needs to stay safe in an outage is free forever.
6. Costume is function.
7. Open where it matters: client and sensing core open source, aggregated grid data open, medicine table and provenance public.

## Primary user reality
Mid-range Android phone, weak battery, completely dark room, congested network. Design and test for that, not for a lit desk.

## Non-goals
Afterglow is not an emergency service, a utility complaint channel, a social network or a news feed. It always shows the official emergency number and never claims to replace it. It is not a medical device: it gives label-derived information with citations and no diagnosis.

## Always-on invariants
The four safety invariants live in their own steering files and apply to every change: `fail-closed.md`, `privacy-aggregation.md`, `night-vision.md`, `label-only-medicine.md`.
