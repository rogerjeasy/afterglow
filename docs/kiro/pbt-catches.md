# Property-based testing — catches

A log of real bugs that property tests found and example tests missed. Each entry: the requirement, the shrunken counterexample, the root cause, and what was wrong (implementation, test, or requirement).

---

## 2026-11-05 · EV-06 · dedup was not order-independent on payload conflict

**Requirement:** EV-06 (append-only accumulates all events) / EV-03 (reduction order-independence).

**Property:** `EV-06 append-only accumulates all events` — reducing a log forward and backward must yield the same view.

**Shrunken counterexample:**
```
[
  { deviceEpoch: "dev-c", lamport: 0, type: "rosterMsg", payload: { v: 0 } },
  { deviceEpoch: "dev-c", lamport: 0, type: "rosterMsg", payload: 0 }
]
```
Two events share the dedup identity `(dev-c, 0, rosterMsg)` but carry different payloads.

**Root cause (implementation bug):** `EventLog.append` dropped any event whose identity was already present, keeping whichever arrived **first**. So the surviving payload depended on arrival order, breaking order-independence: forward kept `{v:0}`, backward kept `0`.

**Fix:** on an identity collision, keep a **deterministic** representative chosen by a canonical string comparison of the whole event (`canonicalLess`), never "first arrived". Dedup identity still excludes payload (EV-04), but the survivor among same-identity events is now order-independent.

**What was wrong:** the implementation. The requirement and test were correct; the design note in `events/requirements.md` (EV-04 Analysis) already implied a corrected re-send is "the same event", but did not pin *which* copy survives — now pinned to a deterministic rule.

---

## 2026-11-05 · SC-01 · schedule merge was not order-independent when only `areaId` differed

**Requirement:** SC-01 (merge is deterministic, commutative and idempotent).

**Property:** `SC-01 merge is commutative and idempotent` — `mergeSchedule(ws)` must equal `mergeSchedule(reverse(ws))`.

**How it surfaced:** the property failed once in the full-workspace run (a random seed) and passed on rerun, so the default 100 runs rarely hit it. A scratch run with 30,000 cases failed at case 1,284 and shrank to the counterexample below. The old default run count had been hiding a real bug.

**Shrunken counterexample:**
```
[
  { areaId: "area-2", startMinute: 151, endMinute: 209, source: "eskomsepush", fetchedAt: 0 },
  { areaId: "area-1", startMinute: 151, endMinute: 209, source: "eskomsepush", fetchedAt: 0 }
]
```
Two windows share span and source and differ only in `areaId`.

**Root cause (implementation bug):** `compareWindows` ordered by start, end and source but not by `areaId` (or `fetchedAt`, `stage`). Array sort is stable, so ties kept **arrival order**; the output order of the two areas depended on input order.

**Fix:** `compareWindows` is now a total order over every field. The property now runs 5,000 cases in CI, and the counterexample is a named regression test.

**What was wrong:** the implementation. The requirement and the property were correct; the default run count was too low to expose it.

---

## 2026-11-05 · TH-02 / TH-04 · `crossingTime` returned a non-finite "at" near ambient

**Requirement:** TH-02 (crossing time is correct and fail-closed), TH-04 (discard = crossing + budget).

**Property:** `TH-04 discard is crossing + budget, never extended`. It failed intermittently in full runs (random seed) and passed on rerun; a 100,000-case scratch run found it at case 6,391.

**Shrunken counterexample:**
```
state = { startC: -2, ambientC: 3e-323, tauMinutes: 1 }, dangerC = 2.5e-323, budget = 0
```
The threshold is strictly between start and ambient, so it counts as "reachable", but `(ambient − threshold)/(ambient − start)` underflows to 0.

**Root cause (implementation bug, fail-closed violation):** `minute = −τ·ln(0) = Infinity`, and `crossingTime` returned `{ kind: 'at', minute: Infinity }`. A confident crossing built from an underflow; downstream `Infinity − Infinity` produced NaN.

**Fix:** a non-finite computed minute now returns `never` ("numerically indistinguishable from ambient"). Added property `TH-02c` (an `at` minute is always finite and ≥ 0) and a named regression test.

**What was wrong:** the implementation. The unreachable branch of TH-02 covered "beyond ambient" but not "so close to ambient that the arithmetic collapses".

---

## 2026-11-05 · FK-05 · `crossingTime` means "passed in the direction of travel", not "reached from below"

**Requirement:** FK-05 (frozen flow: never `ok` past 40 F without a yes) and FK-03 (fridge clock), written while building the `foodkeeper` module.

**Property:** `FK-05 frozen: ok while frozen, lookRequired once at 0 C, never ok past 40 F without a yes`.

**Shrunken counterexample:**
```
state = { startC: 5e-324, ambientC: 0, tauMinutes: 60 }, t = 0
```
A compartment at (about) 0 C in a 0 C room, with 4.4 C as the danger threshold.

**What the failure showed:** `thermal.crossingTime` answers "when is the threshold passed *in the direction of travel*". For a body cooling toward a colder room, a warmer threshold is "already passed" and the function returns minute 0. The property's first oracle used `crossingTime` and expected "not ok from minute 0"; the code, which never warms in that scenario, correctly said `ok`. The disagreement exposed that **both** of us were relying on a meaning that food clocks do not want, and that the same misreading was latent in the code's fridge path: a fridge cooling toward a cold room (3 C toward 2 C) would have been reported `discard` at minute 0. Over-conservative rather than unsafe, but wrong, and it would have shown a false "throw it away" on a cold porch.

**Fix:** `assess.ts` uses `minutesUntilAtLeast`, the first time the temperature reaches the threshold **from below** (0 if already at or above it; none if the ambient is at or below it). The test now checks against an independent bisection oracle on `temperatureAt` instead of reusing a crossing formula. The thermal module is unchanged; its meaning is right for its own requirements.

**What was wrong:** the test oracle (first) and the implementation (latent). Neither the requirement nor the thermal module.
