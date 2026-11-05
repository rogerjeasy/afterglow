# Afterglow logo assets

**Mark:** Eclipse Ember: a dark orb defined by a crescent of fading light, with one ember at its centre.
**Colours:** `#FF0000` core light · `#8F0000` afterglow · `#3D0000` last glow · icon background `#080000`.
Print colours: `#B70000` · `#E09090` · `#F3D3D3`.

## `svg/` (masters, edit these)

| File | Use |
|---|---|
| `afterglow-mark.svg` | Primary mark, transparent, 96 px and up |
| `afterglow-mark-medium.svg` | 33–95 px (outer glow removed) |
| `afterglow-mark-small.svg` | 17–32 px (single thick crescent, larger ember) |
| `afterglow-mark-mini.svg` | 16 px and favicons |
| `afterglow-mark-print.svg` | On white or light backgrounds |
| `afterglow-mark-monochrome.svg` | Single colour (white); recolour freely |
| `afterglow-app-icon.svg` | Square, full-bleed store icon (iOS and Play apply their own corner masks) |
| `afterglow-app-icon-small.svg` | App icon source for 95 px and below |
| `afterglow-app-icon-rounded.svg` | Rounded icon for websites, decks and press |
| `afterglow-app-icon-tinted.svg` | iOS tinted icon layer (white on transparent) |
| `afterglow-android-foreground.svg` | Android adaptive icon foreground (108 dp canvas, mark inside the 66% safe zone) |
| `afterglow-android-monochrome.svg` | Android 13+ themed icon layer |
| `afterglow-favicon.svg` | Modern browsers' SVG favicon |
| `afterglow-lockup.svg`, `-on-black.svg`, `-print.svg` | Mark and wordmark |
| `afterglow-social-1200x630.svg` | Open Graph and social share image |
| `concept-b-lantern-door.svg`, `concept-c-signal-flame.svg` | Alternate concepts, not for production |

The lockup and social SVGs use live text in **Fraunces 600** (and Atkinson Hyperlegible for the tagline). They render correctly only where those fonts are available. The PNGs below were rendered with the fonts loaded and are safe to use anywhere. Convert the text to outlines in a vector editor before sending the SVG lockup to print.

## `png/` (rendered, transparent unless noted)

- `mark/`: primary mark at 16, 24, 32, 48, 64, 96, 128, 256, 512, 1024; print and monochrome versions at 256, 512, 1024.
- `app-icon/`: 1024 (App Store), 512, 256, 192, 180, 167, 152, 144, 128, 120, 96, 87, 80, 76, 72, 60, 58, 48, 40, 32, 29, 20, 16 (opaque `#080000`); tinted 1024; rounded 1024, 512, 256.
- `android/`: adaptive foreground and monochrome at 432, 324, 216, 162, 108 (xxxhdpi to mdpi); `afterglow-play-store-512.png`.
- `web/`: `favicon.ico` (16, 32, 48), `favicon-16/32/48.png`, `apple-touch-icon-180.png`, `pwa-icon-192.png`, `pwa-icon-512.png`.
- `lockup/`: transparent, on black, and print, each at 600×196, 1200×391, 2400×783.
- `social/`: `afterglow-social-1200x630.png`.
- `concepts/`: Lantern Door and Signal Flame at 256 and 512.

## Expo wiring (for later)

- `expo.icon` → `png/app-icon/afterglow-app-icon-1024.png`
- `expo.ios.icon` → same; iOS 18 dark and tinted variants → the same file and `afterglow-app-icon-tinted-1024.png`
- `expo.android.adaptiveIcon.foregroundImage` → `png/android/afterglow-adaptive-foreground-432.png`, `backgroundColor` → `#080000`, `monochromeImage` → `png/android/afterglow-adaptive-monochrome-432.png`
- `expo.web.favicon` → `png/web/favicon-48.png` (or `svg/afterglow-favicon.svg`)
- Splash: `png/mark/afterglow-mark-512.png` on `#000000`

## Rules

- Keep clear space of at least half the mark's width on every side.
- Never recolour the three crescents to other hues, add gradients, glows or shadows, rotate the mark, or place it on a mid-tone background.
- On light backgrounds use the print versions; for single-colour reproduction use the monochrome mark.
