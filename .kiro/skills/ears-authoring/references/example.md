# Example (from `.kiro/specs/cells/requirements.md`)

### CE-10 — Each device counts once, by its latest word
**User story:** As a neighbour, I want a phone that said "dark" and then "lit" to count as lit, not as both.

- WHEN a device has several reports in the window THE SYSTEM SHALL use only its latest by `minute`.
- IF one device has conflicting verdicts at its latest minute THEN THE SYSTEM SHALL treat that device's verdict as `unknown` (fail closed), whatever the input order.

Why it is good: universal ("whatever the input order"), has an explicit unknown branch, and names the fail-closed direction.
