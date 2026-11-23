# Heliograph — Design

## Frame (32 bits)
```
| preamble 8 | Hamming(12,8) word A    | Hamming(12,8) word B |
  11111110      seq(2) code(4) slot(2)   slot(4) crc4(4)
```
- Preamble `11111110`: seven alternating lit/dark pairs for the receiver to lock its clock, then one inverted bit as a marker.
- The 16 body bits are `seq · code · slot · crc4`, where `crc4` is CRC-4 (x^4 + x + 1, zero initial value) over the first 12.
- Each body byte is protected by Hamming(12,8). Decode order: Hamming (correct one flip per word), then CRC on the corrected body, then reject reserved codes.

## Physical layer
Manchester: bit 1 is lit then dark, bit 0 is dark then lit. 64 symbols per frame, three repeats back to back.

| Profile | Symbol | Frame | Three repeats | Needs |
|---|---|---|---|---|
| `standard` | 200 ms (5 per second) | 12.8 s | 38.4 s | any camera |
| `fast` | 100 ms (10 per second) | 6.4 s | 19.2 s | 40 fps or more |

## Receiver pipeline
```
samples {tMs, level} → validate → binarise (percentile threshold + hysteresis)
  → for each profile the camera speed allows (standard always; fast at 40 fps or more):
  → for each 80-symbol window (step 8 symbols):
       timing search: period 0.8T..1.2T, phase 0..p; score = edges on grid lines
       sample symbols at mid-symbol → pair into bits at both parities
       find the preamble → 24 coded bits → decode (Hamming, CRC, code range)
  → candidates with absolute start times
  → accept: two agreeing repeats one frame apart, or a three-repeat vote
  → else repeatRequested / noSignal
  → combine profiles: one message, or two equal ones, or repeatRequested if they differ
```
Per-window timing tolerates a sender clock that drifts over the 38 s transmission. Mid-symbol sampling uses the majority of samples in the centre half of the symbol, so a camera frame that straddles an edge is ignored.

## Failure modes
| Condition | Result |
|---|---|
| fewer than 2 samples, bad times, flat signal | `noSignal` with reason |
| a preamble found but nothing passes the checks | `repeatRequested` |
| exactly one valid repeat | `repeatRequested` |
| two messages each with two repeats | `repeatRequested` |
| reserved code | frame refused |

## Correctness properties
HL-01 to HL-12, linked in `requirements.md` and named in `heliograph.property.test.ts`.
