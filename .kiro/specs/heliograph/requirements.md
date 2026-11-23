# Heliograph — Requirements

**Module:** `packages/core/src/heliograph` (pure frame codec, transmit plan and receiver over a sampled brightness series).
**Workflow:** Design-First (a technically constrained codec; see `design.md`). Requirements are written from the design so each is a property.
**Spec name equals package name** per `structure.md`.

Heliograph carries a short message between two phones with a flashlight and a camera when every radio is down. This module is the deterministic part: it turns a message into a schedule of lit and dark intervals, and turns a sampled brightness series back into a message **or an honest refusal**. The torch, the camera and the blob tracking are adapters and are out of scope. Pure: no I/O, no timers, no randomness.

## Glossary (this spec)
- **Symbol** — one lit (1) or dark (0) interval. Its length depends on the profile.
- **Profile** — `standard` (200 ms symbols, 5 per second, 12.8 s per frame) or `fast` (100 ms symbols, 10 per second, 6.4 s per frame). The fast profile needs a camera of 40 frames per second or more.
- **Bit** — two symbols (Manchester): 1 is lit then dark, 0 is dark then lit.
- **Frame** — 32 bits: an 8-bit preamble and 24 coded bits.
- **Repeat** — one transmission of a frame. The sender sends three back to back.
- **Slot** — the sender's 6-bit pair-local roster slot on the receiver (0 to 63). It is not a global identifier and is not a phone number.
- **Sequence** — a 2-bit counter (0 to 3) that tells consecutive messages from the same sender apart. It is not a security feature.
- **Result** — `message | repeatRequested | noSignal`. There is no "best guess".

## Requirements

### HL-01 — A fixed, closed message set
- THE SYSTEM SHALL define 11 messages (SAFE, HELP, NEED_MEDS, NEED_WATER, NEED_HEAT, NEED_COOL, CHARGE_HERE, WATER_HERE, OPEN_HERE, COMING, ACK) with distinct codes 1 to 11.
- IF a decoded code is 0 or 12 to 15 THEN THE SYSTEM SHALL refuse the frame and SHALL NOT show it as a message.

### HL-02 — The frame round-trips
- FOR every message, slot (0 to 63) and sequence (0 to 3) THE SYSTEM SHALL encode a 32-bit frame that decodes to the same message with no correction.
- IF the code, slot or sequence is out of range or not a whole number THEN THE SYSTEM SHALL return no frame.

### HL-03 — One flipped bit in each coded byte is corrected
- THE SYSTEM SHALL correct any single flipped bit in each of the two 12-bit Hamming words and decode the original message.
- IF a Hamming syndrome points outside the word THEN THE SYSTEM SHALL refuse the frame.

### HL-04 — The CRC judges the corrected frame
- THE SYSTEM SHALL verify a 4-bit CRC over the sequence, code and slot after correction, and SHALL refuse the frame when it fails.
- THE SYSTEM SHALL measure and state how often two flipped bits in one word pass both checks (single-frame miscorrection), so the acceptance rule in HL-08 is justified by a number.

### HL-05 — Manchester coding is lossless and strict
- THE SYSTEM SHALL decode `[1,0]` as 1 and `[0,1]` as 0 and SHALL treat `[0,0]`, `[1,1]` and a missing symbol as invalid, never as a bit.
- FOR any bit sequence, decoding its Manchester encoding SHALL return the same bits.

### HL-06 — The transmit plan is exact
- THE SYSTEM SHALL produce, for a message, 1 to 5 repeats and a profile, runs of `{ lit, ms }` that alternate and sum to `repeats × 64 × symbolMs` ms (12.8 s per repeat standard, 6.4 s fast).
- THE SYSTEM SHALL return no plan for an invalid message or repeat count.

### HL-07 — The receiver reads a real, noisy recording
- GIVEN a brightness series sampled at 20 to 60 frames per second with up to ±20% jitter in the frame interval, a sender clock within ±3% of nominal, any start offset, quiet periods before and after, and brightness noise, THE SYSTEM SHALL recover the transmitted message.
- THE SYSTEM SHALL tolerate a threshold that is not centred and slow changes in ambient light.

### HL-08 — Two agreeing repeats are required
**User story:** As a person who might read "SAFE" for a neighbour, I never want noise to say it.
- THE SYSTEM SHALL return a message only when at least two repeats, one or more frame lengths apart, each pass HL-03 and HL-04 and carry the same message, or when three consecutive repeats vote to a frame that passes both checks.
- IF only one repeat is read THEN THE SYSTEM SHALL return `repeatRequested`, even when that repeat is perfect.
- IF two different messages are each supported by two repeats THEN THE SYSTEM SHALL return `repeatRequested`.

### HL-09 — The receiver never guesses
- FOR any corruption of the recording THE SYSTEM SHALL return either the transmitted message or `repeatRequested` or `noSignal`, and SHALL NOT return a different message.
- THE SYSTEM SHALL record the result of this property at its stated number of runs and any counterexample in `docs/kiro/pbt-catches.md`.

### HL-10 — Unusable input is refused, never thrown
- IF the series has fewer than 2 samples, a non-finite value, non-increasing times, more than 20 000 samples, or too little contrast between lit and dark THEN THE SYSTEM SHALL return `noSignal` with a reason.
- THE SYSTEM SHALL NOT throw for any input.

### HL-12 — Profiles, chosen by measured camera speed
**User story:** As a person in a dark room, I want the faster message when my phone can read it and the robust one when it cannot.
- THE SYSTEM SHALL read a recording in each profile whose minimum camera speed the recording meets (median frame interval at most 26.25 ms for `fast`, which is 40 frames per second with a 5% margin for timestamp rounding; no minimum for `standard`).
- THE SYSTEM SHALL NOT attempt the fast profile on a recording slower than 40 frames per second.
- WHEN both profiles produce a message and they differ THE SYSTEM SHALL return `repeatRequested`.
- THE SYSTEM SHALL read a fast transmission at 40 to 120 frames per second with up to ±20% interval jitter, a sender clock within ±3%, noise and drift, and SHALL NOT mistake a transmission of one profile for a message of the other.

### HL-13 — The brightest blinking spot is found in a grid of camera cells
- GIVEN camera frames reduced to a grid of cell brightnesses, THE SYSTEM SHALL choose the cell whose brightness changes most over the recording and return its brightness series as `BrightnessSample`s.
- THE SYSTEM SHALL ignore cells that never change (a lamp left on, a window) and SHALL pick the same cell whatever order the cells are listed in, breaking ties by index.
- IF the frames are malformed, differ in cell count, are not strictly increasing in time, or no cell changes enough THEN THE SYSTEM SHALL return no series.
- WHEN the chosen series is decoded THE SYSTEM SHALL read the transmitted message with other cells flickering at random.

### HL-14 — The sender follows an absolute schedule (adapter: `packages/adapters/src/heliograph/sender.ts`)
- THE SYSTEM SHALL switch the lamp at `start + planned time` for every run, so a late timer delays one switch by at most its own lateness and the error never accumulates.
- WHEN a send is cancelled or fails THE SYSTEM SHALL leave the lamp dark.
- WHEN a transmission is shown by the sender and filmed by a camera, THE SYSTEM SHALL be read by the receiver in both profiles.

### HL-15 — The reader keeps numbers, not pictures (adapter: `reader.ts`)
- THE SYSTEM SHALL keep only grid frames of the recent window, drop any frame that is not later than the last, and cap the number held.
- THE SYSTEM SHALL answer `noSignal` (with a plain reason) until a blinking light is in view, then decode what it sees.

### HL-16 — The camera adapter reduces frames to a grid and names its failures (adapter: `camera.ts`)
- THE SYSTEM SHALL reduce each video frame to 48 cell values from 0 to 255 and keep nothing else of the picture.
- THE SYSTEM SHALL report a refused permission, a missing camera, a busy camera, an insecure page or an unsupported browser as distinct errors so the screen can say what is missing and what to do.

### HL-17 — Flashing is disclosed, and the faster profile is opt-in
**User story:** As a person who may be sensitive to flashing light, or who sits near someone who is, I must be told before a screen flashes at me.
- THE SYSTEM SHALL use the standard profile by default and SHALL NOT send in the fast profile until the sender has confirmed that nobody nearby is sensitive to flashing light.
- THE SYSTEM SHALL show a flashing-light warning before every screen-lamp send.
- THE SYSTEM SHALL let the sender stop at any moment with one tap, and the lamp SHALL end dark.

### HL-11 — Deterministic
- THE SYSTEM SHALL return the same result for the same series.

## Analysis
- **Frame timing, settled.** The architecture quoted 6.4 s per frame at 5 symbols per second, which is arithmetically impossible for a 32-bit Manchester frame (it would be 12.8 s). Instead of shrinking the figure, the protocol now has two profiles: `standard` at 5 symbols per second (12.8 s per repeat, 38.4 s for three) and `fast` at 10 symbols per second (6.4 s per repeat, 19.2 s for three), which restores the architecture's 6.4 s figure. The fast profile gives each symbol only 100 ms, so it is read only from a camera of 40 fps or more (4 or more readings per symbol); a 30 fps phone uses standard. This is decided by the measured frame interval, not by a setting, so a user never has to know. Rolling-shutter and exposure behaviour of real phones is still to be measured; the simulator cannot answer it.
- **Roster slot, settled.** The slot is 6 bits (64 senders) so the building persona (a caretaker with 60 flats) works and the architecture's `0x2F` example fits. The 2 bits come from the sequence counter, which only tells consecutive messages from one sender apart (4 is enough because repeats are identical and a receiver also dedupes by time). The frame stays 32 bits. Above 64 senders, a receiver needs a group prefix, which is a later protocol revision.
- **Why Hamming plus CRC, and why two repeats.** Hamming(12,8) corrects one flip per byte but can mistake two flips for one. CRC-4 catches most of that but only 15 in 16. A single frame is therefore not enough evidence to show "SAFE" or "HELP" (HL-04 measures the miscorrection rate). Requiring two agreeing repeats that sit exactly one frame length apart multiplies the odds against a false message and rules out a chance match in noise.
- **Measured miscorrection.** Two flips in one Hamming word are refused most of the time, but a small share (under 8%, asserted by the HL-04 test) still passes Hamming and CRC-4 as a different message. This is the quantified reason a single frame is never shown.
- **Flashing and photosensitivity.** The standard profile switches at most every 200 ms, which is 2.5 flashes per second, under the 3 per second general flash threshold of WCAG 2.3.1. The fast profile switches every 100 ms (5 flashes per second) and the lamp is red, which is the colour that guideline treats most strictly. The torch of a phone is far smaller and dimmer than a full screen, so the screen lamp is the risk. Hence HL-17: standard by default, fast only after an explicit confirmation, a warning always, and one-tap stop. A smaller lamp area is a further mitigation to evaluate with a device.
- **Light is public.** Codes carry no personal data and are visible to anyone who can see the torch (privacy-aggregation rule 6). The slot is meaningful only to the paired receiver.
- **Out of scope:** the torch and camera adapters, blob tracking, the acoustic channel (`acoustic`, 1.9), BLE relay, roster resolution and the Séance screen.
