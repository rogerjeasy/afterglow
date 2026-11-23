# Heliograph — Requirements

**Module:** `packages/core/src/heliograph` (pure frame codec, transmit plan and receiver over a sampled brightness series).
**Workflow:** Design-First (a technically constrained codec; see `design.md`). Requirements are written from the design so each is a property.
**Spec name equals package name** per `structure.md`.

Heliograph carries a short message between two phones with a flashlight and a camera when every radio is down. This module is the deterministic part: it turns a message into a schedule of lit and dark intervals, and turns a sampled brightness series back into a message **or an honest refusal**. The torch, the camera and the blob tracking are adapters and are out of scope. Pure: no I/O, no timers, no randomness.

## Glossary (this spec)
- **Symbol** — one lit (1) or dark (0) interval of 200 ms (5 symbols per second).
- **Bit** — two symbols (Manchester): 1 is lit then dark, 0 is dark then lit.
- **Frame** — 32 bits: an 8-bit preamble and 24 coded bits.
- **Repeat** — one transmission of a frame. The sender sends three back to back.
- **Slot** — the sender's 4-bit pair-local roster slot on the receiver. It is not a global identifier and is not a phone number.
- **Result** — `message | repeatRequested | noSignal`. There is no "best guess".

## Requirements

### HL-01 — A fixed, closed message set
- THE SYSTEM SHALL define 11 messages (SAFE, HELP, NEED_MEDS, NEED_WATER, NEED_HEAT, NEED_COOL, CHARGE_HERE, WATER_HERE, OPEN_HERE, COMING, ACK) with distinct codes 1 to 11.
- IF a decoded code is 0 or 12 to 15 THEN THE SYSTEM SHALL refuse the frame and SHALL NOT show it as a message.

### HL-02 — The frame round-trips
- FOR every message, slot (0 to 15) and sequence (0 to 15) THE SYSTEM SHALL encode a 32-bit frame that decodes to the same message with no correction.
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
- THE SYSTEM SHALL produce, for a message and 1 to 5 repeats, runs of `{ lit, ms }` that alternate and sum to `repeats × 64 × 200` ms.
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

### HL-11 — Deterministic
- THE SYSTEM SHALL return the same result for the same series.

## Analysis
- **The documents disagree on frame timing, and the arithmetic wins.** The architecture says a frame takes 6.4 s at 5 symbols per second. That is 32 symbols, which is 16 Manchester bits, but the frame it describes (preamble, sequence, payload, parity) is more than 16 bits. With Manchester at 5 symbols per second, one bit takes 400 ms. The frame below is 32 bits, so **12.8 s per repeat and 38.4 s for three**. The design document's "20 s" hint and the 6.4 s figure should be revised; a faster rate (10 symbols per second) is possible but is a camera and rolling-shutter question for the sensing wave, not a decision to make blind here.
- **The roster id is 4 bits, not 6.** The architecture's example `0x2F` needs 6 bits, but the payload is 8 bits and carries a 4-bit code. A receiver can therefore tell 16 senders apart (slots 0 to 15). A larger roster needs a longer frame.
- **Why Hamming plus CRC, and why two repeats.** Hamming(12,8) corrects one flip per byte but can mistake two flips for one. CRC-4 catches most of that but only 15 in 16. A single frame is therefore not enough evidence to show "SAFE" or "HELP" (HL-04 measures the miscorrection rate). Requiring two agreeing repeats that sit exactly one frame length apart multiplies the odds against a false message and rules out a chance match in noise.
- **Measured miscorrection.** Two flips in one Hamming word are refused most of the time, but a small share (under 8%, asserted by the HL-04 test) still passes Hamming and CRC-4 as a different message. This is the quantified reason a single frame is never shown.
- **Light is public.** Codes carry no personal data and are visible to anyone who can see the torch (privacy-aggregation rule 6). The slot is meaningful only to the paired receiver.
- **Out of scope:** the torch and camera adapters, blob tracking, the acoustic channel (`acoustic`, 1.9), BLE relay, roster resolution and the Séance screen.
