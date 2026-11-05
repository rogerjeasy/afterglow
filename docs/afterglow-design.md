# Afterglow — Design Document (UI and UX)

**Companions:** `afterglow-project-description.md` (what the product is) · `afterglow-architecture.md` (how it is built) · `kiroween-2026-recon.md` (rules).
**Scope:** the complete visual, interaction and content design of every Afterglow surface: the consumer app on phone, tablet and laptop, the Business and Beacon consoles, Voice, widgets, watch faces and print. It is the source of truth the implementation renders from. It is not the implementation.
**Judging target:** *Design — Does the project deliver a complete, coherent product experience, not just a technical proof of concept? Is the design intuitive, polished, and intentional?* Section 17 maps every phrase of that criterion to the decisions below.
**Conventions:** values are exact and were computed, not estimated (relative luminance L and contrast ratio CR use the WCAG formulas). **[my call]** marks a decision the founder may override.

---

## Table of contents

1. Design intent
2. Design principles
3. The Night Shell: luminance modes (the central design decision)
4. Colour tokens
5. Typography
6. Layout, spacing, shape and depth
7. Iconography, illustration and the costume vocabulary
8. Motion language
9. Sound and haptics
10. Information architecture and navigation
11. Screen specifications
12. Responsive and adaptive behaviour
13. Accessibility in the dark
14. Content design, voice and localisation
15. Brand, app icon, splash and print
16. Design quality system
17. Design-criterion crosswalk
18. Decisions for the founder

---

## 1. Design intent

Afterglow is opened in the dark, by someone whose night has just gone wrong. The interface must do three things at once that most apps never have to do together: **be readable at one lux without destroying the user's night vision**, **tell the truth under stress** (including "unknown"), and **feel like a companion rather than a dashboard**. The judges' word is "haunting"; ours is "lantern": warm, low, steady, carried by a person.

Everything spooky in Afterglow is a measurement. The candle is the battery. The tombstone is the fridge. The ghosts are neighbours who have not checked in. The lantern map is where power still exists. The ward is a refused unsafe action. The séance is a flashlight message. Remove any of them and a number disappears. That is what "intentional" means here, and it is why the aesthetic can be unforgettable without ever being decoration.

The experience must be whole. A judge who installs the app in a lit room, turns off the lights and taps around for three minutes must find no dead end, no placeholder, no lorem ipsum, no screen that forgot it would be viewed in the dark, and no state (empty, loading, offline, unknown, error, success) that was not designed.

## 2. Design principles

1. **Dark is the medium, not a theme.** There is no light mode in the consumer app. Luminance is a budget spent on what matters.
2. **One hue.** Red only (amber as an accessibility alternative). Meaning is carried by luminance, size, shape, position and words, never by hue, so colour-blind users and night vision are both served.
3. **Glanceable first.** Every screen answers its question in the first 300 ms: the Hearth in one line, a tombstone in one number, a ghost in one silhouette.
4. **Big, calm, few.** Large type, generous targets, one primary action per screen, no competing motion. Stress narrows attention; the interface narrows with it.
5. **Honest states.** "Unknown" is designed as carefully as "safe". Every number carries a tap-through source. Nothing animates to look alive while it is actually stale.
6. **Costume equals function.** A metaphor earns its place only by encoding a measurement.
7. **Native where it is free, bespoke where it matters.** Platform tab bars, sheets, headers, alerts and menus; a bespoke token system, iconography and motion vocabulary on top.
8. **Every state designed.** Loading, empty, offline, unknown, error, denied permission, first run, success. No screen ships with fewer than its states.
9. **Nothing overflows.** Every container shrinks, every string wraps, every table reflows; horizontal scrolling exists only inside explicitly scrollable carousels.
10. **Measure the design.** Luminance ceilings, contrast ratios, target sizes and frame budgets are properties tested in CI, not aspirations.

## 3. The Night Shell: luminance modes

### 3.1 The problem the design must solve honestly
Scotopic (night) vision depends on rhodopsin, which long-wavelength red light (≥ 620 nm) bleaches far less than white or blue. A pure-red interface kept dim lets a person read the phone and still see the stairwell. But WCAG's contrast ratio assumes photopic viewing in lit rooms: on pure black, the ratio is (L + 0.05) / 0.05, and a red whose luminance stays under the 8% night ceiling can never exceed **2.6:1**. The 4.5:1 ratio for normal text requires a red of at least **#EB0000 (L 17.7%)**, which is bright enough to cost night vision. No single palette satisfies both. Afterglow therefore ships **three luminance modes**, selected automatically by ambient light and always overridable by the user, all red-only, all sharing the same layout and components.

### 3.2 The three modes
| Mode | When | Text ceiling | CR vs black | How legibility is guaranteed |
|---|---|---|---|---|
| **Night** (default below ~5 lux) | Blackout, bedroom, stairwell | `#A50000` (L 8.0%) | 2.6:1 | Scotopic design: body text ≥ 20 px at weight 600, +2% letter-spacing, high-x-height typeface, no thin strokes, no small caps, no grey; verified in the dark-room lab, not by ratio |
| **Dusk** (≈ 5–50 lux, or user choice) | Candle-lit room, dawn, car | `#B70000` (L 10.1%) | 3.04:1 | Every text run is WCAG "large text" (≥ 19 px at weight 700), so **WCAG 2.2 AA large-text (3:1) is met for all text** |
| **Ember** (lit room, low vision, or user choice) | Onboarding, consoles, daytime review | `#EB0000` secondary (L 17.7%), `#F20000` primary, `#FF0000` emphasis | 4.5:1 / 4.8:1 / 5.3:1 | **WCAG 2.2 AA normal-text (4.5:1) is met for all text**; still red-only, so night vision degrades gracefully rather than collapsing |

Surfaces, hairlines and the ember glow are identical in all three modes; only the text and icon tiers shift. Switching modes is a 280 ms crossfade of token values with no layout change.

### 3.3 Mode selection rules
- Ambient Light Sensor (native) or camera-based estimate (web) chooses the mode; the user can pin a mode in two taps from the Hearth; the choice is remembered per time of day.
- The **Lights-Out** moment (section 8.4) always lands in Night.
- Onboarding, Business and Beacon default to Ember; Beacon additionally offers a **Daylight operations theme** (section 4.5), the only non-black surface in the product, because operators work in lit control rooms. The consumer app never offers it.

### 3.4 Amber alternative (protanopia)
About one in a hundred men perceives red as very dark. For them, every mode has an **Amber** variant at identical luminance tiers (`#784300` at 8%, `#864B00` at 10%, `#AE6100` at 17.6%). Amber bleaches rhodopsin a little more than red; the trade is stated in Settings and the default remains red.

### 3.5 What this means for judges
The app is readable at 1 lux because its design is measured in luminance, and it is WCAG-conformant because Dusk and Ember exist. The write-up and the trust centre say exactly this, with the numbers.

## 4. Colour tokens

### 4.1 Base ramp (red, G = B = 0), computed
| Token | Hex | L | CR vs black | Role |
|---|---|---|---|---|
| `red.000` | `#000000` | 0.00% | 1.0 | background |
| `red.005` | `#080000` | 0.05% | 1.01 | surface 1 |
| `red.010` | `#100000` | 0.11% | 1.02 | surface 2 |
| `red.020` | `#1A0000` | 0.22% | 1.04 | surface 3 / pressed |
| `red.050` | `#2A0000` | 0.49% | 1.10 | hairline |
| `red.100` | `#3D0000` | 0.99% | 1.20 | ember edge, disabled fill |
| `red.200` | `#560000` | 1.98% | 1.40 | muted text (Night) |
| `red.300` | `#6A0000` | 3.06% | 1.61 | muted text (Dusk) |
| `red.400` | `#780000` | 3.99% | 1.80 | secondary text (Night) |
| `red.500` | `#8F0000` | 5.84% | 2.17 | secondary (Dusk), muted (Ember) |
| `red.600` | `#910000` | 6.02% | 2.20 | primary text (Night) |
| `red.700` | `#A50000` | 8.00% | 2.58 | emphasis (Night), primary (Dusk), focus ring |
| `red.800` | `#B70000` | 10.07% | 3.04 | emphasis (Dusk), secondary (Ember) |
| `red.900` | `#EB0000` | 17.66% | 4.51 | primary text (Ember) |
| `red.950` | `#F20000` | 18.88% | 4.78 | emphasis (Ember) |
| `red.1000` | `#FF0000` | 21.26% | 5.25 | HELP received (Ember only) |

### 4.2 Semantic tokens by mode
| Semantic | Night | Dusk | Ember |
|---|---|---|---|
| `bg` | red.000 | red.000 | red.000 |
| `surface.1 / .2 / .3` | red.005 / .010 / .020 | same | same |
| `hairline` | red.050 | red.050 | red.050 |
| `glow` (ember edge, live indicator) | red.100 | red.100 | red.200 |
| `nontext.muted` (inactive icons, rules; never text) | red.200 | red.500 | red.800 |
| `text.secondary` | red.400 | red.800 (regular) | red.900 (regular) |
| `text.primary` | red.600 | red.800 (bold) | red.950 (bold) |
| `text.emphasis` | red.700 | red.800 (larger size) | red.1000 |
| `icon.primary` | red.600 | red.700 | red.900 |
| `control.fill` | red.020 | red.020 | red.050 |
| `control.fill.primary` | red.100 | red.100 | red.200 |
| `control.label.primary` | red.700 | red.800 | red.950 |
| `focus.ring` | red.700 | red.800 | red.950 |
| `alert.help` | red.700 pulsing | red.800 pulsing | red.1000 |
| `scrim` | black 80% | black 80% | black 85% |

Hierarchy note: the Dusk ceiling admits exactly one text shade that reaches 3:1 (`#B70000`), and the Ember AA band runs only from `#EB0000` to `#FF0000`. In both modes text hierarchy is therefore carried by size and weight, not by luminance steps; dimmer reds are reserved for non-text elements, where WCAG's 3:1 non-text rule applies. HELP is distinguished by its glyph, label and pulse, not by a unique colour.

Rules: components consume semantic tokens only; raw hex never appears outside `theme.night.json`; a lint rule and the Playwright luminance scan enforce the ceiling per mode; every token file is the single source for native, web, print and the Figma library (Figma variables → tokens via the Figma Power).

### 4.3 Amber ramp (same luminance stops)
`#000000 · #0A0600 · #140C00 · #1E1100 · #2A1700 · #3B2100 (2%) · #553000 (4%) · #683A00 (6%) · #784300 (8%) · #864B00 (10%) · #AE6100 (17.6%) · #B86700 (18.9%)`.

### 4.4 Data colour (charts)
Single-hue sequential ramps from the base ramp (five stops), pattern fills for categories (hatch, dot, dash), never hue-coded series; the "coming back" state is the glow token pulsing; satellite confirmation is a hairline badge, not a colour.

### 4.5 Daylight operations theme (Beacon only)
Background `#FFFFFF`, ink `#111111`, hairline `#E6E0E0`, accent `#B70000` (CR on white 7.0:1), muted `#5A5A5A`. Used only in Beacon when the operator selects it. Print materials use the same theme.

## 5. Typography

### 5.1 Typefaces **[my call]**
- **Atkinson Hyperlegible Next** for all UI and body text. Designed by the Braille Institute for low-vision readers: unambiguous I/l/1, 0/O, b/d; open apertures; sturdy strokes that survive dim red. Variable weight; weights 500–700 used.
- **Atkinson Hyperlegible Mono** for clocks, timers, numerals in tiles and tables: tabular by nature, same letter logic, so numbers never jump as they tick.
- **Fraunces** (variable: optical size, SOFT, WONK) for the costume voice only: screen titles ≥ 28 px, tombstone epitaphs, the splash wordmark, section headings in Guidance. Weight 600, SOFT 50, WONK off, optical size auto. A warm, slightly haunted serif that remains sturdy at display sizes; never below 28 px, never for data.
- System fonts are the fallback on every platform; weights are bundled as static files so no synthetic weights occur.

### 5.2 Type scale (Night mode values; Dusk identical; Ember may use the lighter variants)
| Style | Face | Size / line | Weight | Use |
|---|---|---|---|---|
| `display` | Fraunces | 40 / 44 | 600 | Lights-Out line, onboarding welcome |
| `title` | Fraunces | 28 / 34 | 600 | Screen titles, epitaphs |
| `headline` | Hyperlegible Next | 22 / 28 | 700 | Tile titles, section heads |
| `body` | Hyperlegible Next | 20 / 28 | 600 (Ember 500) | All reading text; the minimum in Night and Dusk |
| `label` | Hyperlegible Next | 18 / 24 | 600 | Buttons, tabs, chips |
| `caption` | Hyperlegible Next | 16 / 22 | 600 | Sources, timestamps; the absolute minimum anywhere |
| `clock.xl` | Hyperlegible Mono | 56 / 60 | 600 | Hearth outage timer |
| `clock.lg` | Hyperlegible Mono | 32 / 36 | 600 | Tombstone epitaph numbers, candles |
| `clock.md` | Hyperlegible Mono | 24 / 28 | 600 | Inline numbers |

Letter-spacing +2% in Night and Dusk; 0 in Ember. In Dusk every style is set at ≥ 19 px, weight 700, so all text qualifies as large text. Dynamic Type scales all styles up to 200%; layouts reflow (tiles go single-column, tables become stacked cards) rather than truncating. No text is ever clipped with an ellipsis if it carries a number or a source.

### 5.3 Numbers
Durations as "3 h 10 m", never "3:10" (ambiguous in the dark); temperatures with unit and locale; times in the user's 12/24-hour setting; large numbers abbreviated only in charts; every number is a tappable chip revealing its source and model version.

## 6. Layout, spacing, shape and depth

### 6.1 Grid and spacing
- 4-point grid. Scale: `4, 8, 12, 16, 20, 24, 32, 48, 64` (named xxs…4xl).
- **Three distinct rhythms** so proximity carries meaning: row gap 12 · group gap 24 · section gap 40. Never "16 everywhere".
- Screen gutters by window class: compact 20 · medium 24 · expanded 32 · large 40.
- Prose measure capped at 720 px on large screens; maps and timelines are full-bleed.

### 6.2 Shape
Radius 12 (controls), 16 (tiles), 24 (sheets), full (pills); continuous corner curves everywhere. Tombstones use a 24 px top radius and square base, the only asymmetric shape in the system, so they read as tombstones at a glance.

### 6.3 Depth without shadows
Shadows are invisible on black and cost battery on OLED. Hierarchy comes from the surface tiers, a 1 px hairline, and the **ember edge**: a 1 px top border in `glow` on any surface that is live (sensing, ticking, listening). Pressed state is a step down one surface tier, never a scale on full-width rows; buttons scale to 0.97 for 120 ms.

### 6.4 Components (the contract)
Every primitive defines variants, sizes (`sm 44`, `md 56`, `lg 72` px targets), states (default, pressed, disabled, loading, selected) and accepts a `style` override merged last. The set: `Button` (primary, secondary, ghost, destructive-ward), `Tile` (status, clock, metric), `Tombstone`, `Candle`, `GhostRow`, `StatusLine`, `SourceChip`, `ModeSwitch`, `Compass`, `Timeline`, `MapOverlay`, `CodeButton` (Heliograph), `WardCard`, `EmptyState`, `UnknownState`, `OfflineBadge`, `Sheet` (native form sheet), `Toast` (haptic-paired), `Field` (visible label, inline error), `ListGroup` (grouped rows with hairlines, not cards in cards).

## 7. Iconography, illustration and the costume vocabulary

### 7.1 Lantern Icons
A bespoke set of about forty glyphs on a 24 px grid, 2 px stroke, rounded joins, single weight, with filled twins for selected states: candle, candle-low, tombstone, tombstone-cracked, ghost, ghost-solid, lantern, lantern-lit, ward, séance (a lamp with rays), hearth, bellwether (a tilted gauge), compass, pump, lift, tower, pharmacy-cross, generator, fuel, snowflake, thermometer, sun, moon, key (QR pairing), eye (camera receive), torch (send), ear (hum listening), satellite, check-in, help. Utility glyphs (back, settings, share, search, close) come from Lucide, restroked to 2 px so the family is uniform. No emoji anywhere.

### 7.2 Illustration policy
Illustration exists only where it carries data (the candle's wax level, the tombstone's darkening, the ghost's opacity, the lantern map's glow). Onboarding uses the same objects, lit, as its teaching images. A 4% grain texture on surface tiers adds warmth on OLED without crushing blacks; it is disabled in battery saver.

### 7.3 Costume vocabulary and what each element measures
| Element | Measurement it encodes | Behaviour |
|---|---|---|
| **Candle** | Remaining energy of a store; wax height = percentage; drip marks = predicted hour it dies | Drips appear on tier change; flame height follows draw rate; flame goes out at 0 |
| **Tombstone** | A cold compartment; epitaph = time to discard | Stone darkens from `surface.3` to `bg` as the clock runs; cracks on discard |
| **Ghost** | A roster member not yet heard from | Opacity 0.35 → 1.0 on check-in; channel glyph appears |
| **Lantern map** | Where mains exists | Lit cells glow; dark cells are black; "coming back" cells breathe (slow pulse) |
| **Ward** | A refused unsafe action | A bar closes across the card; message stays until the condition is met |
| **Séance** | The Heliograph screen | Symbols tick as frames send; the receiver shows a decoding ring |
| **Graveyard shift** | The hours-of-safety timeline | A night axis with the threshold crossing marked as a headstone |
| **Hearth** | The home screen | The one line of truth at the top, the candle beside it |
| **Bellwether** | Grid-stress gauge | A needle that tilts with frequency deviation; "stress rising" copy |

## 8. Motion language

### 8.1 Gate first
Every animation passes the frequency gate before it exists: things that happen a hundred times a day (tab switches, keyboard, scrolling, toggles) do not animate; press feedback stays under 150 ms; sheets and alerts get standard motion; the rare moments (Lights-Out, restoration, first pairing, a cracked tombstone) hold the delight budget. Tabs never slide.

### 8.2 Tokens
| Token | Value | Use |
|---|---|---|
| `motion.press` | 120 ms, ease-out `cubic-bezier(0.23, 1, 0.32, 1)` | Button scale 0.97, row highlight |
| `motion.state` | 180 ms, ease-out | Chip, toggle, mode crossfade start |
| `motion.surface` | spring `{ duration: 300, dampingRatio: 0.8 }` | Sheets, drawers, anything a finger drags |
| `motion.cross` | 280 ms, ease-in-out `cubic-bezier(0.77, 0, 0.175, 1)` | Luminance-mode change, tile content swap |
| `motion.signature` | 700–900 ms choreography | Lights-Out, restoration only |
| `motion.ambient` | 3–5 s loop, ≤ 6% luminance variance | Candle flame on the Hearth only; off under reduced motion or battery saver |

Only `transform` and `opacity` animate; nothing animates layout. Everything runs on the UI thread. Judged on a release build on the slowest supported Android.

### 8.3 Micro-interactions
- **Press**: feedback on press-in, commit on press-out; buttons scale 0.97; full-width rows highlight one surface tier; `hitSlop` to 48 dp where visuals are smaller.
- **Source chip**: tap expands inline (opacity + translateY 8 px) to show source, model version and timestamp.
- **Tombstone tick**: numbers change with a 180 ms crossfade, never a roll.
- **Ghost solidify**: 300 ms ease-out from 0.35 to 1.0 opacity with a 0.98 → 1.0 scale; one light haptic.
- **Ward refuse**: a bar slides closed across the card in 250 ms (ease-out) with a medium haptic; no shake, no red flash; the explanation remains.
- **Mode crossfade**: tokens interpolate over 280 ms; layout untouched.

### 8.4 Signature moments
- **Lights-Out** (once per outage): the current screen fades to pure black over 300 ms; after a 200 ms beat the Hearth's status line ignites from the centre outward (opacity 0 → 1, scale 0.96 → 1.0, 400 ms ease-out), then the candle and tiles appear in a single 250 ms stagger of 40 ms; one long haptic at the ignition frame. Under reduced motion: a 300 ms fade to the finished Hearth.
- **Restoration**: the lantern map's dark cells breathe twice (pulse of the glow token) and then light; the status line crossfades to "Power is back on your street"; two short haptics. Under reduced motion: a fade.
- **Séance**: sending shows the symbol stream as blocks lighting in time with the torch (this is the protocol itself, 5 Hz, so it is exempt from the ambient rule); receiving shows a ring that fills with decoded bits and resolves into the name and code with a 180 ms crossfade.
- **Tombstone crack**: on discard, a crack draws across the stone in 400 ms and the epitaph changes to "Discard · why"; one medium haptic.

### 8.5 Reduced motion
Fewer and gentler, not zero: opacity and colour changes that explain a state remain; translation, scale, parallax, overshoot and all ambient loops are removed; screen transitions become fades.

## 9. Sound and haptics

Haptics are a grammar, always paired with a visual and never per frame or on entrance: **one long** (medium impact) = outage detected; **two short** (light) = restoration; **three** (medium) = HELP received; **selection tick** = a ghost checked in or a value crossed a step; **warning notification** = a clock threshold reached; **medium impact** = a ward refusal. Sound is off by default; when on, it is limited to the Heliograph acoustic channel (functional) and a soft tick on alerts. Every sound has a visual twin.

## 10. Information architecture and navigation

### 10.1 Primary navigation
Five destinations on the platform tab bar (compact), a navigation rail (medium and expanded), a sidebar (large and consoles). Tabs are peers and never slide.

| Destination | Icon | Contains |
|---|---|---|
| **Hearth** | hearth | Status line, outage timer, candle, mode switch, tiles: tombstones, hours of safety, medicines, ghosts summary, grid-stress, water countdown |
| **Lantern** | lantern | Ember Map, lit places, schedule and adherence, Signal Finder, Dependent Services |
| **Séance** | séance | Roster and ghost board, send a code, receive (camera), pairing, Lamplighters |
| **Cold** | tombstone | Compartments, inventory, "Can I eat the…", medicines and excursion clocks |
| **Plan** | candle | Hours of Safety timeline, Candles energy plan, CO Guard, generator log |

A "more" sheet from the Hearth header holds Alerts, History and reports, Household, Business, Guidance and Ask, Settings. Deep links exist for every screen and state; back behaves predictably on every platform; the stack header is the platform's (large-title collapse on iOS, Material top app bar on Android), never rebuilt.

### 10.2 Hierarchy of screens
Hearth → tile → detail → source. Lantern → map → cell or place → detail. Séance → ghost board → person → channel. Cold → compartment → item → rule. Plan → timeline → action → destination. Three levels maximum before a terminal screen.

## 11. Screen specifications

Each screen lists purpose, layout, the one primary action, states, and responsive behaviour. Wireframes are compact-width unless noted; `[ ]` marks a tappable control.

### 11.1 Onboarding (lit room, Ember mode)
Eight short steps, each skippable, progress shown as a lantern filling. No promotional carousel: every step collects something the dark will need.
1. **Welcome**: the display line "The only app you can read when the grid dies", a single `[Start]`. The screen performs a 2-second preview of the Lights-Out moment so the user understands the mode switch before it happens for real.
2. **Region**: country and mains frequency inferred, confirmable; providers listed with their status.
3. **Calibrate the ear**: two 2-second samples ("hold the phone near a lamp that is on" / "now anywhere in the room") with a live waveform in red and a result ("Hum found at 100 Hz · confidence high"). States: microphone denied (explains what is lost; continue), noisy room (retry or skip).
4. **Your cold things**: pick appliances from an illustrated grid (fridge, freezer, chest freezer, combo, cooler, pharmacy fridge); fullness as a three-step chip; optional BLE sensor scan.
5. **Your home**: building type, vintage, floor, insulation, with a plain-language result ("A flat like yours holds its heat about 20 hours in winter").
6. **Medicines**: search the validated formulary; unknown products offer "photograph the label for review".
7. **Energy and devices**: phone (auto), power bank, laptop, car, inverter or battery (connect), generator, medical devices.
8. **Your people**: pair by QR in person or invite by number; explain mutual consent; add dependents.
Then **Permissions explained** one at a time, each with the sentence that says what is lost if denied. Finish on the Hearth in Ember; the first dark room will switch it to Night.

### 11.2 Hearth (home)
```
┌──────────────────────────────────────┐  compact
│ ●Night   Afterglow            [more] │  header: mode pill, title (Fraunces), more
│                                      │
│  GRID DOWN  00:07:12   ▮▮▮▮▯ 68%     │  status line (clock.xl) + candle (battery)
│  14 neighbours lost power at 20:07   │  body
│  ESP says 22:30 · crowd says 22:50   │  secondary + [source chips]
│                                      │
│ ┌──────────────┐ ┌──────────────┐    │  tiles 2-up (clock.lg numbers)
│ │ ▢ Fridge     │ │ ▢ Freezer    │    │  tombstones: epitaph = time to discard
│ │  3 h 10 m    │ │  22 h 40 m   │    │
│ └──────────────┘ └──────────────┘    │
│ ┌──────────────┐ ┌──────────────┐    │
│ │ Hours of     │ │ Insulin      │    │
│ │ safety 7 h   │ │ 27 d left    │    │
│ └──────────────┘ └──────────────┘    │
│ ┌──────────────────────────────────┐ │  ghosts summary row
│ │ ◌◌●●● 3 of 5 neighbours safe  › │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ Water pressure ~2 h · Lift down  │ │  dependent services
│ └──────────────────────────────────┘ │
│                                      │
│          [ ◉  I'M SAFE  ]            │  one primary action, 72 px, thumb reach
├──────────────────────────────────────┤
│  Hearth  Lantern  Séance  Cold  Plan │  platform tab bar
└──────────────────────────────────────┘
```
- **Primary action**: I'M SAFE sends to the roster by every working channel; the button becomes "Sent · SMS, light" with a timestamp.
- **States**: mains present (status line "Power on · next window 22:00–00:30", tiles show readiness advice); unknown ("Listening…" with the ear glyph and what is missing); offline badge in header; first run without appliances (tiles become invitations with one verb each).
- **Expanded (tablet/laptop)**: status line spans; tiles 3-up; the ghost board docks on the right as a pane; the primary action moves to the rail's bottom.

### 11.3 Lights-Out moment
A full-screen transition, not a screen: described in 8.4. The first frame after ignition is the Hearth. If the mode switch happened automatically, a dismissible line under the status reads "Switched to Night for your eyes · Dusk · Ember".

### 11.4 Lantern (Ember Map)
```
┌──────────────────────────────────────┐  compact
│ ‹  Lantern            [layers] [⌖]  │
│ ┌──────────────────────────────────┐ │
│ │   ▓▓▓▓▒▒░░  map: black = dark    │ │  full-bleed MapLibre, dark basemap,
│ │   ▓▓▓▓▒▒░░  glow = lit           │ │  cells as soft rectangles; "coming
│ │   ▓▓ ●hospital (lit)  ░░░░       │ │  back" cells breathe; places as glyphs
│ │   ▓▓▓▓▓▓▓▓▓▓▓▓  ● you           │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │  bottom sheet (native, detents)
│ │ Your cell · DARK since 20:07     │ │
│ │ 41 devices · confirmed by crowd  │ │  provenance line
│ │ Crowd 22:50 (22:30–23:40) · ESP 22:30 │
│ │ ───────────────────────────────  │ │
│ │ Nearest lit: Baragwanath Hosp 1.4 km │
│ │ Pharmacy with generator · 900 m  │ │
│ │ [Schedule] [Signal] [Services]   │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```
- Layers sheet: crowd cells, provider schedule, satellite confirmation, lit places, water, lifts, signal, fuel, ATMs.
- **Unknown cells** are plain black with a dotted hairline and the word "unknown" on tap; never a guess.
- **Expanded**: map left, a persistent detail pane right (list-detail); the bottom sheet becomes the pane.
- **Offline**: the last tiles with "as of 20:31" stamped on the map; schedule from cache.

### 11.5 Séance (roster and Heliograph)
Ghost board:
```
│ Séance                        [+ pair]
│ ◌ Mrs Dlamini · 4th floor · no word  [send light ›]
│ ● Paulo · courtyard · SAFE 20:41 via light
│ ● Mom · across town · SAFE 20:39 via SMS
│ ◌ Mr Naidoo · 2nd floor · no word   [send light ›]
│ ● Sipho (caretaker) · lobby · SAFE 20:35 via BLE
│ ──────────────────────────────────────────
│ [ Send a code ]        [ Receive ]
```
Send a code: six oversized `CodeButton`s (SAFE, HELP, NEED MEDS, NEED WATER, CHARGE HERE, COMING) on a 2-column grid, each 96 px tall with glyph and word; a recipient chip row; a channel row showing what will be used (light · sound · SMS · BLE) with unavailable channels greyed and explained. Pressing SAFE starts the torch: a symbol stream renders as blocks lighting in time; "Point the torch at their window · 20 s". HELP always shows the official emergency number above the button.
Receive: a camera viewfinder in red tint, a reticle, a decoding ring that fills; result card "Mrs Dlamini: SAFE · 20:44 · via light" with a solidifying ghost; failure "Could not read · ask them to repeat" (never a guess).
States: no roster yet (teach pairing with one QR illustration), camera denied, torch unavailable (screen-as-lamp fallback explained).

### 11.6 Cold (compartments, inventory, medicines)
Compartment grid of tombstones (2-up compact, 3-up medium, 4-up expanded), each with epitaph `clock.lg`, an ember edge while the model is live, a sensor glyph when a BLE thermometer is present. Compartment detail: a temperature curve (red line on black, threshold hairline at 4 °C, door events as ticks), "Door opened" `[+]` button, inventory list with per-item discard times, "Can I eat the…" search field with deterministic answers and a USDA source chip. Medicines: list with excursion bars (budget consumed), detail with the label excerpt, approver, date and the sentence "Derived from the FDA label; confirm with your pharmacist".
States: no appliances (invitation), sensor lost (model takes over, said plainly), beyond label (ward-style card "Excursion beyond label · consult your pharmacist").

### 11.7 Plan (Graveyard Shift, Candles, Ward)
Graveyard Shift: a horizontal night axis from now to dawn; the indoor temperature curve descending; the threshold crossing marked with a small headstone and the time "10 °C at 03:40"; an uncertainty band as a hatched region; below, the plan as three steps ("one warm room", "layers and water", "warming centre at 1.4 km, lit") each with `[Navigate]`.
Candles: a shelf of candles, one per store (phone, power bank, laptop, car, inverter), heights = charge, drips = predicted end; below, the plan as an ordered list ("Keep the CPAP on the power bank: 6 h", "Charge phone from laptop at 60%"); infeasible items are stated ("Oxygen concentrator cannot run from any store you have · nearest lit clinic 1.4 km").
Ward (CO Guard): a checklist with a bar that stays closed until every condition is confirmed; the "Set up" button is literally behind the bar.

### 11.8 Alerts centre
Grouped by day with hairlines; each alert has glyph, headline, source chip and the channel it came by; HELP alerts pin to the top with the pulsing glow token; quiet hours and haptic grammar settings live here.

### 11.9 History and reports
A list of outages (duration, promised vs actual, discards, check-ins); a report screen with a printable layout (Daylight theme in print) and `[Share]` as PDF.

### 11.10 Household, Guidance, Ask, Settings
Household: people, dependents and devices as grouped lists; invitations. Guidance: a library of cited articles typeset for Night (Fraunces heads, Hyperlegible body, 720 px measure). Ask: a single field, answers phrased from the cited corpus with chips to the sources; "I don't know" is a designed state. Settings: luminance mode and hue, region and providers, roster and privacy, appliances, home, medicines, devices, integrations, alerts, data export and delete, trust centre.

### 11.11 Business console (desktop web, Ember default)
Three-pane layout at ≥ 1200 px: sites rail · fridges and generators list · detail with live temperature traces and compliance timeline; a top status bar showing "open and lit" publication; a report builder producing the WHO-aligned cold-chain report and the spoilage claim package. Tables reflow to cards below 840 px.

### 11.12 Beacon console (desktop web, Ember or Daylight)
Map canvas with layer rail (crowd cells, provider, satellite, lit places, services, cell-site severity, vulnerable-population aggregates), a timeline scrubber for playback, an advisory composer with language and channel selection and a preview of the Voice script, scorecards (utility adherence) as single-hue bar charts with pattern fills, exports. Keyboard-complete; every chart has a data table toggle.

### 11.13 Afterglow Voice (USSD, SMS, IVR)
Designed as scripts, not screens. USSD menus fit 182 GSM-7 characters per screen with numbered options and a `0 Back`; every path terminates within eight inputs; prompts are self-contained for SMS. IVR phrases are recorded by native speakers from a template catalogue; menus never exceed three options per level; silence is never treated as "safe".

### 11.14 Widgets, Live Activities and watch
Widgets: outage timer with candle (small), status line with next window (medium), tombstones row (large); all black with red text at the Ember tier (widgets render on arbitrary wallpapers so the ceiling is relaxed). Live Activity: the outage timer and "coming back" state. Watch complications: timer, hours of safety, ghost count; critical haptics for HELP.

### 11.15 Printables
Lobby poster (A4/A3), door cards, shelter board, Heliograph code card for a window: Daylight theme, large type, QR to install, the roster's codes explained with pictograms.

## 12. Responsive and adaptive behaviour

### 12.1 Window size classes
| Class | Width | Navigation | Content grid | Typical devices |
|---|---|---|---|---|
| Compact | < 600 dp | Platform tab bar | 4 columns; tiles 2-up (1-up at Dynamic Type ≥ 150%) | Phones portrait |
| Medium | 600–839 | Navigation rail | 8 columns; tiles 3-up; map with bottom sheet | Phones landscape, small tablets, folded foldables |
| Expanded | 840–1199 | Rail | 12 columns; list-detail panes; map + side pane | Tablets, iPad, unfolded foldables |
| Large | ≥ 1200 | Sidebar | 12 columns; three-pane consoles; prose capped at 720 | Laptops, desktops |

### 12.2 Rules that prevent overflow
- Every flex or grid child has `min-inline-size: 0`; every text node wraps (`overflow-wrap: anywhere` for identifiers); no `nowrap` on anything carrying a number, a name or a source.
- Chips wrap into rows; tables become stacked cards below 840 px; charts switch to a data table below 480 px.
- Horizontal scrolling exists only inside carousels with visible edge affordance and a keyboard equivalent.
- Fluid type on web via `clamp()` between the compact and large values; native uses Dynamic Type.
- Safe areas respected by the platform header and tab bar; bottom primary actions sit above the home indicator; scroll content carries bottom insets so nothing hides under fixed bars.
- Landscape phones use the medium layout; foldables in tabletop posture put the map or viewfinder on the upper half and controls on the lower.
- Tested at 320 px width, 375, 390, 430, 600, 768, 820, 1024, 1280, 1440 and at 200% text.

### 12.3 Web specifics
Viewport meta set; no zoom disabling; PWA display standalone; the Night Shell dims via a full-screen overlay because browsers cannot set hardware brightness; keyboard focus rings 2 px `focus.ring` with 2 px offset on every operable control; skip link to the status line.

## 13. Accessibility in the dark

- **Luminance modes** (section 3) give conformance paths: Dusk meets AA for large text everywhere; Ember meets AA for normal text everywhere; Night is a disclosed night-vision instrument mode. The trust centre publishes the numbers.
- **Screen readers**: every metaphor has a literal name and value ("Fridge, safe for 3 hours 10 minutes, source USDA"; "Mrs Dlamini, not yet heard from"; "Ward: generator setup blocked, exhaust condition unmet"). Decorative glyphs are hidden; icon buttons carry names and states; focus order follows visual order; live regions announce the status line and HELP.
- **Motor**: targets 56 px default, 72 px for the primary action, `hitSlop` on glyphs, no precision gestures, every swipe has a button equivalent, switch access supported.
- **Cognitive**: one primary action per screen in emergency states; plain language; numbers with units; no modal interruptions for routine actions; undo for reversible actions; confirmations only for irreversible ones.
- **Vision**: Dynamic Type to 200% with reflow; Amber variant for protanopia; no hue-coded meaning (there is one hue); high x-height typeface; no thin strokes.
- **Hearing**: every sound has a visual twin; haptics never the only feedback.
- **Low literacy**: Lantern Icons paired with words everywhere; Voice line for feature phones; pictogram printables.
- **Motion**: reduced motion honoured as fewer and gentler; ambient flame off.

## 14. Content design, voice and localisation

### 14.1 Voice
Calm, plain, short. Say what is known, what is unknown and what to do. Never alarmist, never cute during an emergency; the costume lives in the objects and the type, not in jokes. Examples:
- Status: "Grid down 00:07:12 · 14 neighbours lost power at 20:07."
- Unknown: "Listening… I can't tell yet whether the power is out here. Plug in the phone or let me hear the room."
- Food: "Chicken: safe for 3 h 10 m more. Fridge crossed 4 °C at 21:20 · USDA."
- Medicine: "Insulin glargine (in use): 27 days left at a modelled 22 °C · from the FDA label · confirm with your pharmacist."
- Hours of safety: "Your home reaches 10 °C at about 03:40 (03:00–04:30). Nearest lit warming centre 1.4 km."
- Ward: "Generator not marked as set up. Exhaust must face away from windows."
- Restoration: "Power is back on your street. Fridge stayed under 4 °C for 2 h 50 m."
Every number carries a source chip. "Safe" is never used beyond its source.

### 14.2 Localisation design
Twenty launch languages; strings designed for 40% expansion; no text in images; RTL mirroring for Arabic and Urdu including the Graveyard Shift axis and compass; locale-aware units, times and number formats; voice phrase banks recorded by native speakers for languages without TTS; translations drafted by AI and approved by native reviewers, with the approver's name in the trust centre.

## 15. Brand, app icon, splash and print

- **Mark: Eclipse Ember.** A darkened orb defined only by a crescent of light on its lower edge, drawn as three stepped crescents in the Night Shell's own luminance tiers (`#FF0000` core light, `#8F0000` afterglow, `#3D0000` last glow), with a single ember dot at the centre. Meaning: the grid has gone dark, the glow remains, and one light (the person, the app) is still on. Pure geometry: circles and circular masks on a 200-unit grid, no gradients.
- **Wordmark**: "Afterglow" in Fraunces 600, set beside the mark at mark height ≈ 1.35× cap height.
- **App icon**: the full mark on `#080000` with a hairline edge; a single-layer tinted version (core crescent and ember only) for iOS tinted and Android themed icons; a print version on white with `#B70000`, `#E09090`, `#F3D3D3`.
- **Small sizes**: below 64 px the outer glow is dropped; below 32 px the crescent thickens and the ember grows so the mark survives as a favicon.
- **Splash**: black; the three crescents ignite from the inside out (opacity, 120 ms apart), then the ember; under reduced motion a static mark.
- **Alternates kept on file**: Lantern Door (a lantern whose glass is a doorway) and Signal Flame (a flame drawn as rings of signal).
- **Marketing site**: the same tokens in Ember; the only bright element is a lux-meter photograph showing the phone at under one lux.
- **Print**: Daylight theme with the ember arc in `#B70000`; posters, door cards, shelter boards, a Heliograph code card.

## 16. Design quality system

- **Tokens as code**: Figma variables are the design source; the Figma Power exports `theme.night.json`; a lint rule forbids raw colour outside the theme; a property test checks every token's luminance per mode (`L ≤ ceiling`, `R ≥ 3·max(G, B)`).
- **Pixel scan**: Playwright screenshots every route in every mode and fails the build on any pixel above the mode ceiling (the lux-meter MCP does the same for a running build).
- **Component states matrix**: Storybook (native and web) renders every primitive in every variant, size, state and mode; visual regression on every pull request.
- **Contrast matrix**: automated contrast checks per mode against the targets in section 3.
- **Device lab**: low-end and mid-range Android from each launch region, iPhones, iPad, a laptop at 1280 and 1440, a lux meter and a blackout room; release builds only.
- **Usability protocol**: dark-room sessions with elderly, low-literacy and low-vision participants in Johannesburg, Kyiv and San Juan; tasks: find whether the chicken is safe, send SAFE, read the hours of safety; success is unaided completion under 90 seconds.
- **Native-slop review**: every screen is checked against the twenty named tells (web modal, X-button sheet, emoji icons, gradient hero, floating pill tab bar, arbitrary font, everything-a-card, shadowboxing, wireframe borders, alert confirmations, hand-rolled header, 16-everything, squish reflex, grand entrance, onboarding carousel, cross-platform costume, safe-area collision, dark-mode amnesia, spinner blink, keyboard blindness). Afterglow's deliberate exceptions are documented: bespoke typography (justified by low-vision legibility), a bespoke icon family (justified by the costume vocabulary), and a bespoke primary action bar (justified by one-thumb emergency use).
- **Design review gates**: no screen merges without its states, its mode screenshots, its Dynamic Type 200% screenshot and its screen-reader transcript.

## 17. Design-criterion crosswalk

| Judge's phrase | How Afterglow answers it | Evidence |
|---|---|---|
| **Complete** product experience | Every module has a designed screen; every screen has every state; onboarding, settings, history, consoles, Voice, widgets, print exist; no dead ends | Section 11; Storybook states matrix; the judge quick-start walk |
| **Coherent** | One token system, one type system, one icon family, one motion grammar across app, consoles, Voice scripts and print; metaphors reused consistently | Sections 4–9; the Figma library |
| **Not a proof of concept** | Three luminance modes with measured conformance; localisation design; accessibility beyond ratios; device-lab and usability protocols | Sections 3, 12, 13, 16 |
| **Intuitive** | One-line status, one primary action, three-level hierarchy, platform navigation, literal names for every metaphor, numbers with units and sources | Sections 10, 11, 14 |
| **Polished** | Motion tokens on the UI thread, haptic grammar, 120 ms press feedback, no overflow at any width or text size, pixel-scanned luminance | Sections 8, 9, 12, 16 |
| **Intentional** | Every spooky element encodes a measurement; red-only is a physiological decision with the maths shown; "unknown" is designed; deliberate exceptions to native conventions are documented with reasons | Sections 1, 3, 7, 16 |
| **Haunting, polished, unforgettable UI** (Costume Contest) | The Lights-Out moment, the breathing lantern map, the tombstones that crack, ghosts that solidify, the séance by torch | Section 8.4 and the video |

## 18. Decisions for the founder

1. **Typefaces**: Atkinson Hyperlegible Next + Mono with Fraunces for display is my call; the alternative is system type only (loses the costume voice, gains zero font loading).
2. **Amber default for protanopia**: offered as a setting; a founder may prefer to surface it in onboarding.
3. **Daylight theme in Beacon**: included for operators; remove if you want the "no light mode" rule absolute across the product family.
4. **Ambient candle flame**: kept at ≤ 6% variance on the Hearth only; remove if you prefer a fully static interface.
5. **Lantern Icons**: a bespoke set of about forty glyphs is a real design investment; Lucide-only is the fallback.
6. **Brand mark**: Eclipse Ember is the recommended mark; Lantern Door and Signal Flame are the alternates. A trademark search is needed before the store listing.
