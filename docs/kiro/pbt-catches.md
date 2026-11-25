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

---

## 2026-11-05 · Accounts · what the tests missed and the browser audit found

Not property-test shrinks, but the same discipline: passing tests are not enough until they have been made to fail. Each item below changed the code.

**1. A test that could not fail (ACC-06).** The first cross-account test swapped a ciphertext between two accounts that also had different keys, so it failed whatever the associated data was. Removing the account id from the AAD (a deliberate mutation) left all 35 tests green. Added `ACC-06c`, which uses the *same key* with a different account id, revision and purpose; with the mutation applied it now fails. Other mutations checked: KDF ignoring the passphrase (11 tests fail), throttling disabled (2 fail), demo store writing to real storage, lock keeping the account store, idle lock ignoring the outage exemption, and sign-in from inside another account (each caught by at least one test).

**2. The lockout was invisible (ACC-11).** In a real browser the fifth wrong attempt locked the account, but the screen said nothing until a sixth was refused. Unit tests asserted that the service threw; nobody asserted the UI was told. `run()` now reads the lockout from the service after every failure, with a test that the failure that starts the lockout reports it.

**3. The lockout was forgotten on navigation.** Tapping "I forgot my passphrase" cleared the on-screen messages, and the lockout with them, leaving an enabled button that would be refused. The lockout is now read from the service for the account in view (`controller.retryUntil`), not remembered as a message.

**4. A context switch brightened the screen in a blackout (night vision).** The pixel scan flagged full-red pixels on the demo screen: opening the demo (a space with no outage) was read as "power restored" and the app switched Night to Ember. Locking an account mid-outage would have done the same. The decision now lives in a pure, property-tested function (`night-shell/modePolicy.ts`): a change of space never brightens and never replays Lights-Out. The failure appeared once more after the first fix and then not in six reruns, so the policy was moved out of effect timing rather than trusting the fix.

**5. Focused inputs hid under the fixed tab bar.** Scripted interaction with a lower form field landed on the tab bar. Fixed with `scroll-padding-bottom` so focus scrolling clears the bar.

**6. Browser autofill paints a pale background** that would break the night-vision rule. The autofill pseudo-class is overridden with the surface token and the create form is covered by the pixel scan.
---
## 2026-11-23 · HH-10 / FM-08 · modelled series was not strictly increasing, so a medicine clock came back `unknown`
**Requirement:** HH-10 (assessment is deterministic and survives a long outage), FM-08 (modelled series sampling), FM-09 (invalid input is `unknown`).
**Property:** `HH-10 assessment is deterministic and survives a very long outage` and `HH-09 door openings never reduce what has been used`.
**Shrunken counterexample:**
```
HH-10:  elapsed = 8631791 minutes        (step = elapsed / 2000)
HH-09:  ambientC = 10, elapsed = 2187 minutes, no door openings
```
Both returned `{ kind: 'unknown', reason: 'Reading times must be strictly increasing.' }` instead of a clock.
**Root cause (implementation bug):** `modelledSeries` placed `ceil((to - from) / step)` grid points and then always appended a final sample at `toMinute`. With `step = elapsed / 2000`, floating-point rounding made `ceil(...)` equal 2001, so the last grid point landed exactly on `toMinute` and the appended sample repeated it. `excursionClock` correctly refused the non-increasing series (fail closed), so the user saw "unknown" for an ordinary outage.
**Fix:** `modelledSeries` now skips any grid point that is not strictly after the previous one or not strictly before `toMinute`, and appends `toMinute` once. The series is strictly increasing, starts at `fromMinute`, and ends at `toMinute` for any window and step.
**What was wrong:** the implementation. The clock's validation and the requirements were right. The FM-08 test used integer steps that divide the window, so it never hit the rounding case; a regression property (`length / pieces` over 500 runs plus fixed cases) now guards it, and fails against the old code.
---
## 2026-11-23 · HL-10 / HL-02 / HL-07 · four real defects in the first Heliograph receiver
All four were found by the property suite during the first runs of `heliograph.property.test.ts`, and each has a test that fails against the old code.

**1. HL-10: a hostile timestamp made the receiver loop forever.** Property `HL-10 arbitrary input never throws` hung the test run for 10 minutes. Counterexample class: two samples at `tMs = 0` and `tMs = 1e300`. The window loop advanced with `ws += step`, which does not change `ws` at that magnitude. *Root cause (implementation):* a floating-point loop bound on untrusted input. *Fix:* the window count is computed up front, and a recording is refused if a time is beyond 1e12 ms or the span exceeds 20 minutes.

**2. HL-02: a message named `toString` encoded into a frame.** Counterexample `{ code: 'toString', slot: 0, sequence: 0 }`. *Root cause (implementation):* `MESSAGE_CODES[msg.code]` found `Object.prototype.toString`, which is not `undefined`. *Fix:* an own-property check.

**3. HL-07: a perfect recording was unreadable at some alignments.** Shrunk to a clean 20 fps recording, no noise or jitter, nominal sender clock, message SAFE slot 0 sequence 0 (60 fps failed too). *Root cause (implementation):* the timing search quantised the phase to 1/12 of a symbol, so the origin could sit about 42 ms from the real edges, while the least-squares refinement rejected edges further than 40 ms. It threw away every edge and returned no clock. *Fix:* centre the phase on the circular mean of the edges before fitting.

**4. HL-07: a receiver that starts watching exactly at the first symbol lost its first repeat.** Shrunk to lead time 0, trail time 0, sender 3% fast: `repeatRequested` where two repeats were present. *Root cause (implementation):* symbol sampling dropped a symbol whose start was a few milliseconds before the window although the middle half that is actually sampled was inside it. *Fix:* include a symbol when its sampled middle half lies in the window.

**Not a bug but worth stating:** HL-04 measures that two flips in one Hamming word slip past both Hamming and CRC-4 in a small but real fraction of cases (the test asserts it is non-zero and under 8%). That number is why HL-08 requires two agreeing repeats. HL-09 (never a different message) held over about 20 000 corrupted recordings.
**Test gap found by mutation:** removing the repeat-spacing rule survived the first suite. A test now sends two frames at gaps that are not a whole number of frame lengths and requires `repeatRequested`.
---
## 2026-11-23 · HL-12 · the fast-profile speed limit excluded exactly 40 fps
**Property:** `HL-12 a noisy, jittery fast recording is read at 40 to 120 fps`. **Shrunken counterexample:** `SAFE, slot 0, sequence 0, 40 fps, jitter ~0, sender clock 0.97, no noise` returned `noSignal`.
**Root cause (implementation):** the eligibility test was `median interval <= 1000/40`. A 40 fps recording's median interval is `25.000000000000004` ms in floating point, so the very speed the rule names was refused. **Fix:** a 5% margin (`SPEED_TOLERANCE`) stated in HL-12, and a test at 40, 39 and 36 fps.
**Test gap found by mutation:** ignoring a disagreement between the two profiles survived the first suite. A test now joins a fast and a standard transmission of different messages and requires `repeatRequested`.

---

## 2026-11-25 · HL-07 / HL-08 · back-to-back repeats spelled a false frame, so three messages could not be read

**Requirement:** HL-07 (the receiver reads a recording within the spec envelope), HL-08 (two agreeing repeats are required), HL-09 (never a wrong message).

**Property:** `HL-07 a noisy, jittery, drifting recording is read at any frame rate from 20 to 60`.

**How it surfaced:** the property failed in about one full run in four on a random seed and passed alone, which looked like load. Re-running it alone four times reproduced it once, and fast-check shrank it to a clean case: no noise, no jitter, no lead-in, 20 fps, a sender clock 3% slow.

**Shrunken counterexample:**
```
{ msg: { code: "CHARGE_HERE", slot: 58, sequence: 2 }, fps: 20, jitter: 0,
  clockScale: 0.97, leadMs: 0, noise: 0, drift: 0 }  →  repeatRequested (expected message)
```

**What narrowed it:** a sweep over timing found nothing, so the failure depended on the *content*. A sweep over all 2,816 messages at the failing timing found three that fail at **every** timing, including a perfect clock with a 1.5 s lead-in: `ACK/57/0`, `NEED_COOL/31/3`, `CHARGE_HERE/58/2`. Tracing the stages showed the receiver finding five frames where three were sent.

**Root cause (implementation bug):** with repeats back to back, the tail of one frame and the head of the next can spell a preamble 16 bits in, and the 32 bits after it can pass the Hamming and CRC checks. That is a second, false frame, half a frame out of step, and it recurs at every repeat boundary. For these three messages the receiver then saw two different messages each supported twice and refused (`repeatRequested`). Refusing is the safe outcome, but those messages could never be read, so a roster slot of 57 or 58 could not have received an ACK or CHARGE-HERE.

It was also a latent safety defect: had a real repeat been damaged, the false pair could have been the only group with two agreeing repeats, and the app would have shown a message the sender never sent (HL-09).

**Fix:** frames cannot overlap in time, so `accept` drops a frame that overlaps a better supported one. Support is the number of detected frames on the same repeat lattice: the real frames have three, the false ones two. Where support ties, neither wins and the existing conflict rule still refuses. One corner remains refused by design (`CHARGE_HERE/58/2` at 20 fps, clock 3% fast, recording cut 48 ms before the last repeat ends), where a real and a false lattice tie exactly.

**Tests added:** an exhaustive test over every one of the 2,816 messages (the random property had been the only thing exercising this, and it found it about once in four runs), a named test for the three messages at the spec corners, and a HL-09 test that damages a repeat of a message that spells a false frame and asserts the answer is the message or a refusal, never another message. **Mutation check:** with the old `receive.ts` restored, the exhaustive test fails on exactly those three messages and the corner test fails; with the fix they pass, and the suite passed six runs in a row.

**What was wrong:** the implementation. The requirement and the property were correct. The exhaustive enumeration the property lacked is now a test.

---

## 2026-11-25 · CE-13 · a held verdict is forgotten after 30 minutes (a design tension, not a shrunk counterexample)

**Honest framing:** this was found by a hand-built timeline test written for the new windowing layer (`cellTimeline`), not by a fast-check shrink. It is recorded here because it is exactly the kind of defect the evidence file exists for: the test failed, the cause was a conflict between two written rules, and no implementation bug was involved.

**Requirement:** CE-01 (k distinct devices in the last 30 minutes) against `privacy-aggregation.md` rule 4 (a device reports on verdict change only).

**Test:** `CE-13 a timeline threads each window into the next`: six devices go dark at minute 20 and are restored at minute 60.

**Failure:** the cell read `lit`, not `comingBack`, at minute 60. At minute 55 nothing had been reported for 35 minutes, so the cell had already fallen to `unknown` and so was never `dark` when the restore edges arrived. CE-05 correctly refuses to say a cell that was not dark is "coming back".

**Root cause (requirements conflict):** a 30-minute distinct-device window forgets any verdict nobody repeats. With change-only reporting, every long outage turns `unknown` after 30 minutes, which is the opposite of what a map is for.

**Resolution so far:** pinned, not hidden. The kernel behaves correctly and is unchanged. A named test (`Q1`) pins that a verdict nobody repeats falls back to `unknown` at 30 minutes. The simulator assumes a re-confirmation every 20 minutes while a verdict holds (SIM-03). **Open question Q1** in `.kiro/specs/cells/requirements.md` needs a privacy review: either allow re-confirmation reports (same fields, no new data) or have the Flink job carry each device's last verdict forward with a TTL. Until then the map is simulated and labelled as such.
