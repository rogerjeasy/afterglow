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
