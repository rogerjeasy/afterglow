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

---

## 2026-11-26 · GD-01 · the test's oracle read a fact as a replacement pattern

**Requirement:** GD-01 (Wisp never invents a number; a slot shows its fact exactly as given).

**Property:** `GD-01 every digit in a rendered line comes from a filled slot`: a filled line must equal the template with each slot's fact in place, untouched.

**Shrunk counterexample:**
```
step: fridge   ("Your fridge keeps food safe for {fridge} more. ...")
facts: { fridge: "$& " }
```

**Root cause (test bug):** the oracle built the expected line with `String.prototype.replace(string, string)`, where `$&` in the replacement means "the matched text". So the oracle expected `{fridge} ` where the renderer, correctly, wrote `$& `. The renderer passes a function to `replace`, which inserts text literally. The same oracle had a second latent flaw: replacing slots one at a time would also substitute inside an earlier fact that happened to contain `{estimate}`.

**Fix:** the oracle now splits the template on its slots and interleaves the facts, in one pass, with no pattern semantics.

**What was wrong:** the test. Worth keeping because the opposite mistake, in the renderer, would have let a fact rewrite Wisp's sentence, which is exactly what GD-01 forbids. The property is now the guard against that regression.

---

## 2026-11-26 · GD-09 / NS-10 · Wisp's fade blended one step above the night-vision ceiling

**Requirement:** GD-09 (the guide passes the pixel scan in Night, Dusk and Ember), resting on NS-10 (no pixel above the mode's ceiling).

**Check:** the Playwright pixel scan (`e2e/tour.e2e.ts`), judged by the pure `scanRgba`. Not a property test, but the same idea: a rule checked over every pixel instead of a few hand-picked ones.

**What it found, deterministically:**
```
tour step 9 in dusk:  1 pixel at r=184, ceiling red.800 = 183   (ghost faded with SVG group opacity 0.935)
tour step 5 in night: 1 pixel at r=166, ceiling red.700 = 165   (after a first fix: translucent stroke over translucent fill)
```

**Root cause (implementation):** both versions blended two translucent layers drawn in the ceiling colour. Group opacity is composited in a premultiplied offscreen buffer, and a translucent stroke over a translucent fill is blended twice; either way Chrome's 8-bit rounding can land one step above the colour both layers share. Mathematically the result is at most the ceiling; in pixels it was not.

**Fix:** only the body fades (`fillOpacity`, one layer). The outline is opaque, in `nontext.muted`, which is far below every ceiling, so no blend involving it can approach one.

**What was wrong:** the implementation. Worth recording because the breach was one level in 255 on one pixel of a 56 px ghost, invisible to a reviewer, and a design rule written as "keep it dim" would never have caught it. A ceiling checked on every pixel did.

---

## 2026-11-26 · CA-10 · two devices minted the same person id, so a merge silently kept one

**Requirement:** CA-10 (sync never drops an event; a household is the same on every device after a merge).

**How it surfaced:** not a property at first. The cloud-account integration test (`apps/mobile/src/spaces/cloud.test.ts`, which drives two devices through the real controller and the real `services/vault` handler) added "Paulo" on device two and "Mom" on device one. After the 409 and the merge, device one showed only "Mom". Tracing the merge showed both events present, each with `personId: "p1"`.

**Root cause (implementation, latent since Wave 1.5):** the household store made ids as `prefix + lamport`. Unique on one device; on two devices sharing a household, both mint `p1`, and the roster's last-writer-wins correctly keeps one. Harmless until sync existed, then silent data loss.

**Fix:** ids are qualified by the device epoch (`p7.dev-<random>`), which is unique per device by construction. A new property, `CA-10 people added on two devices are all there after a merge (ids never collide)`, builds two real stores and checks the merged roster; with the old id code restored it fails on the first case.

**What was wrong:** the implementation, and a gap in the first merge properties, which generated ids that never collided.

---

## 2026-11-26 · CA-10 · a merge could overwrite an edit made a moment before

**Requirement:** CA-10.

**How it surfaced:** the same integration test, offline then back online: "Paulo" was added offline and sync ran at once. The merge read the last *saved* copy (the save is debounced by 150 ms), so Paulo was not in it, and applying the merge replaced the in-memory data, losing him.

**Fix:** each sync round saves pending edits first, and applying a merge merges once more with what is in memory at that moment, so nothing typed during the network round-trip is lost. The first version of the flush re-armed the sync on every round (the link counted its own save as a new edit) and ended in "error"; the link now ignores its own save.

**What was wrong:** the implementation. Recorded because it is the classic sync bug (a merge that clobbers local state), and it was caught before any person's data existed.

---

## 2026-11-26 · CA-12 · an email over 40 characters could never open a cloud account

**Requirement:** CA-12 (cloud accounts work for every adult with an email) and ACC's account-name rule (1 to 40 characters after NFKC normalisation).

**How it surfaced:** testing the deployed app in a real browser with a throwaway user whose email was 41 characters. Cognito sign-in succeeded and the vault answered 404 (no vault yet), then the app showed "Use a name of 1 to 40 characters." and opened nothing. The earlier live check used shorter emails and passed.

**Root cause (implementation):** long emails were shortened to 39 characters plus "…" (one character, 40 in all). The account service normalises names with NFKC first, which turns "…" into "...", so the name became 42 characters and was refused. Every email over 40 characters was locked out, on sign-up as well as sign-in.

**Fix:** shorten after normalising, with ASCII dots. A new property, `CA-12 any email up to 254 characters makes a valid account name (NFKC, at most 40)`, and a controller test that signs up and signs in elsewhere with a 68-character email; both fail on the old code. A failed sign-in or confirmation now also signs out of Cognito, so no half-open session stays in memory.

**What was wrong:** the implementation, and a gap in tests that only ever used short emails. Worth recording because only a test of the deployed app, with realistic data, found it.

---

## 2026-11-27 · NS-10/GD-09 · a focus-ring border on the guide's bubble scanned one step over the Dusk ceiling

**Caught by:** the Playwright pixel scan of the tour (`e2e/tour.e2e.ts`, GD-09), during the web-experience redesign.

**Counterexample:** tour step 5 in Dusk, one pixel at red 184, against a ceiling of 183 (`#B70000`), on the edge of Wisp's speech bubble.

**Root cause:** the redesign gave the bubble a `focus.ring` border. In Dusk that token sits exactly at the text ceiling, and the bubble also fades in with an opacity animation. Compositing the border's antialiased edge over the moving layer rounded one pixel up a step. It is the same family as the 2026-11-26 ghost-outline catch: a colour at the ceiling must never be blended.

**Fix:** the bubble keeps the `hairline` border it had before. Ceiling-tone colours stay on opaque, unanimated strokes.

**What was wrong:** the design change, not the rule or the scan.

---

## 2026-11-27 · GL-07 · the Ask phrasing check let invented numbers through

**Requirement:** GL-07 (drop any phrasing containing a number that is not in the passages).

**Property:** `GL-07 a phrasing that introduces any number not in the passages is rejected` (`services/crowd/src/handler.property.test.ts`), with numbers written in ASCII and in six other scripts' digits.

**Shrunken counterexamples:**
```
passages [" 0.0 h."],  phrasing " about 0 hours."   → accepted
passages [],           phrasing " about ٠ hours."   → accepted
```
Through `POST /v1/ask` the same property shrank to the insulin answer with the phrasing "It is fine for 0 hours." (the passages say 15, 30, 28 and so on).

**Root cause (implementation bug):** `groundedNumbers` checked each number with `source.includes(n)`, a substring test on the joined passages, so "0" passed next to "30", "2" next to "28" and "4" next to "48": exactly the invented hours and doses the check exists to stop. Separately, it matched numbers with `\d`, which is ASCII only, so a reply written with Arabic-Indic, Devanagari or full-width digits carried no numbers at all as far as the check could see.

**Fix:** numbers are matched with `\p{Nd}` (any script's digits) and compared as whole tokens against the set of numbers in the passages. A number in another script than the passages' is dropped, which fails closed. The two counterexamples are named regression tests. Number words ("forty-eight") are still not checked; the model is told to add no number, and that limit stands.

**What was wrong:** the implementation. The requirement was right; the live smoke test only ever saw phrasings that reused the passages' numbers.

---

## 2026-11-27 · BC-04 · a fridge going from too warm straight to too cold was one "too warm" excursion

**Requirement:** BC-04 (each fridge's excursions outside its range, in the cold-chain report).

**Property:** `BC-04 every out-of-range reading lies in exactly one excursion of its own direction, and in-range readings in none` (`apps/mobile/src/console/coldchain.test.ts`).

**Shrunken counterexample:**
```
range 2–8 °C, readings [ 9 °C at minute 0, 0 °C at minute 1 ]
→ one excursion { direction: "warm", worstC: 0, endMs: null }
```
The report would have printed "too warm, worst 0 °C" for a fridge that had overheated and then frozen.

**Root cause (implementation bug):** `summariseFridges` kept an open excursion until a reading came back in range. A reading out of range on the other side was folded into it: its direction stayed "warm" and `worstC` took `Math.min`, the cold rule, so the worst reading came from the wrong side and the freeze was never reported as its own excursion.

**Fix:** a reading out of range on the other side closes the open excursion at that reading and opens a new one in the other direction. The counterexample is a named regression test.

**What was wrong:** the implementation. A freeze after an overheat matters for vaccines (freezing destroys some of them), so the report must show both.

---

## 2026-11-27 · BC-05 / DF-14 · a tab or a line break glued two words together

**Requirement:** BC-05 (public texts printable, single-spaced and bounded) and DF-14 (the name on a pairing link).

**Properties:** `BC-05 cleanText keeps words apart: any run of whitespace between words becomes one space` (`services/console/src/console.property.test.ts`) and `DF-14 a name keeps its words apart: any whitespace between them becomes one space` (`apps/mobile/src/seance/pairing.test.ts`).

**Shrunken counterexamples:**
```
cleanText(".\tA ")  → ".A"     (expected ". A")
cleanName("a\tA ")  → "aA"     (expected "a A")
```

**Root cause (implementation bug):** both functions removed `\p{C}` before collapsing whitespace. Tab, line feed and carriage return are control characters as well as whitespace, so they were deleted instead of becoming a space. A Beacon advisory typed on two lines ("Water at the school.↵Open until 18:00") was published as "school.Open".

**Fix:** whitespace becomes a single space first, then the remaining control characters and angle brackets go, then whitespace is collapsed once more. The counterexamples are named regression tests.

**What was wrong:** the implementation: the order of two replacements.

---

## 2026-11-27 · DF-14 · the 40-character cut of a name could split an emoji or end on a space

**Requirement:** DF-14 (pairing links carry the person's number and name; nothing passes through a server).

**Properties:** `DF-14 a pairing link reads back as the same number and name, with the offer only in the hash` and `DF-14 a name lands on someone else's list printable, single-spaced and at most 40 characters`, with long names that put a space or an emoji near the cut.

**Shrunken counterexamples:**
```
pairLink / parsePair, slot 0, name "AAAAaaAaAAaAAAAAAAaaaaaAAAaaaAAaAaaAaA 😀" (38 letters, space, emoji)
→ read back with "�" where the emoji was
cleanName("aAaAAAaAaaaAAAaAAaaAaaAAaaaAAaAAaAaaAaA x") (39 letters, " x")
→ ends in a space; cleaning it again gives a different name
```

**Root cause (implementation bug):** `cleanName` trimmed and then cut with `slice(0, 40)`, which counts UTF-16 units. An emoji across the cut left half of a surrogate pair, which the link encoder turns into U+FFFD, so the receiver saw a different name than the sender showed; a cut just after a space left a trailing space, so the name was not stable under its own cleaning.

**Fix:** cut by code points (`[...t].slice(0, 40)`) and trim after the cut. Regression tests keep both counterexamples.

**What was wrong:** the implementation. Cosmetic in effect, but the name is the one thing a pairing shows the other person.

---

## 2026-11-27 · WX-01 · a legacy link to #/constructor threw before the first render

**Requirement:** WX-01 (a legacy `#/<tab>` link is replaced by its `/app/...` path before the first render).

**Property:** `WX-01 an unknown #/ name opens the product, never a crash` (`apps/mobile/src/router.test.ts`), whose names include those a plain object answers for itself.

**Shrunken counterexample:**
```
base "/", location "/#/constructor"
→ TypeError: to.startsWith is not a function
```
`#/toString`, `#/hasOwnProperty` and `#/__proto__` did the same.

**Root cause (implementation bug):** `redirectLegacy` looked the tab up with `map[name] ?? '/app'` on an object literal, so an inherited property (a function, or `Object.prototype`) was taken for a route and `href()` threw on it. `main.tsx` calls `redirectLegacy()` before React mounts, so such a link left a blank page.

**Fix:** only own keys count (`Object.hasOwn(map, name)`); anything else opens `/app`. The four names are a regression test.

**What was wrong:** the implementation. Low risk (nobody links to `#/constructor` by accident), but a URL should never be able to stop the app from starting.

---

## 2026-11-27 · NS-21 · Linux CI found amber pixels greener than amber, on every screen

**Requirement:** NS-21 (every route in amber stays within its mode's ceiling and the amber hue).

**How it surfaced:** the amber pixel scan passed all 75 routes locally on macOS and failed 75 of 75 on the first CI run on Ubuntu. The scanner's first offenders were pixels such as `(13,16,0)`, `(0,4,0)` and `(31,21,0)` at the edges of glyphs: greener than any colour in the amber ramp (maximum G/R 0.6).

**Root cause (test environment, not the product):** desktop Chromium on Linux smooths text with sub-pixel (LCD) anti-aliasing, which mixes each colour channel separately at glyph edges and paints coloured fringes. With pure red the fringe cannot leave the hue, because red text has no green to spread; amber has, so its fringes were greener than amber. macOS Chromium uses greyscale smoothing, so the local run never showed it. Phones also smooth in greyscale, so no person would ever see these pixels.

**Fix:** the browser tests render text the way a phone does (`--disable-lcd-text` in `apps/mobile/playwright.config.ts`). The hue rule itself was not loosened. CI is green on Ubuntu, with all 75 amber scans and all red scans passing.

**What was wrong:** the test environment. The finding is still useful: on a Linux or Windows desktop browser with sub-pixel smoothing, amber text edges are slightly greener than the amber ramp. Every offender the scanner reported was a hue failure ("not amber"), none a brightness one.

---

## 2026-11-27 · SIM-04 / CE-05 · a dark cell whose restores trickled in never showed "coming back"

**Requirement:** SIM-04 (the user's cell runs lit, dark, coming back, lit through the real core), CE-05 (restoration).

**Property:** `SIM-04 the user cell goes lit, dark, coming back, lit through the real core`, 10 random neighbourhood seeds per run.

**How it surfaced:** one CI run on Ubuntu failed it; every local run and the next CI run passed. The log carried the fast-check seed and the counterexample, and the failure reproduced locally on the first try.

**Shrunken counterexample:**
```
seed 1872461 → states ['lit', 'dark', 'lit']   (expected ['lit', 'dark', 'comingBack', 'lit'])
user cell ke7f9v, 41 devices, power back at minute 160
minute by minute: 155 dark · 160 mixed · 160 mixed · 160 lit
```

**Root cause (requirement and implementation):** `comingBack` was allowed only when the previous state was exactly `dark`. When fewer than k = 5 phones report the restore in the first minute, the cell is first `mixed` (some phones back, the rest still out), and from `mixed` the rule could never say "coming back". So the map skipped the state whenever restores trickled in, which is how real restores arrive. The live API had the same flaw: it derives the prior state from five minutes earlier. The existing CE-12 test even asserted that a prior `mixed` with six restore edges stays `lit`: the test encoded the gap. The push alert was not affected, because `mixed` is never stored as the last pushed state.

**Fix:** a cell that was dark or partly dark (`mixed`) comes back when at least k distinct devices report a restore edge. A lit, unknown or new cell still never comes back. CE-05 amended to say so.

**Tests added:** `CE-12 a partly dark (mixed) cell comes back once k devices report a restore edge`, `CE-13 a dark cell whose restores trickle in still passes through coming back` (both fail on the old rule), and `SIM-04 regression: seed 1872461 passes through coming back`.

**What was wrong:** the requirement, and the test written from it. Ten random seeds a run had found it about once in many runs; a flaky red is a finding, not noise.
