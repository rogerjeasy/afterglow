# Web experience — Design

## Shape
- `router.tsx`: a ~100-line history router (`useLocation`, `navigate`, `Link`, `redirectLegacy`). No routing dependency; BASE_URL-aware (WX-01).
- `Root.tsx`: the route table. Site and auth load eagerly; `App` (the product) is a lazy chunk so the homepage stays light. The service worker precaches every chunk, so the product still opens offline.
- `styles/tailwind.css`: Tailwind v4 with `--color-*: initial`, `--shadow-*: initial`, `--text-*: initial`, and token colours declared `@theme inline` as `var(--text-primary)` etc. The Night Shell CSS is imported into the `base` layer so utilities win over it (WX-02).
- `ui/`: `icons.tsx` (Lantern Icons, 24 px grid, 2 px stroke), `kit.tsx` (logo, reveal-on-scroll, CTA links, section heads), `page.tsx` (`Page`, `PageHeader`, `Panel`).
- `site/`: `SiteLayout` (sticky header settling onto a surface, full-screen phone menu, footer), `Home`, the content pages and `visuals.tsx` (costume illustrations drawn from tokens: phone mock, lantern grid, flash code, graveyard curve, candles, ghosts).
- `auth/`: split-screen pages that call the same `SpaceController` methods the You screen calls.
- `shell/AppShell.tsx`: sidebar on `lg`, sticky top bar with the outage pill, mode switch and alerts, demo banner, tab bar below `lg`.

## Decisions
- **Red-only stays absolute** (founder, 2026-11-27): the redesign's depth comes from type (Atkinson Hyperlegible Next and Mono, Fraunces display), red-only radial washes, hairlines, and motion, never from a new hue or a shadow. The homepage lets visitors switch the page itself between Night, Dusk and Ember.
- **Fonts are self-hosted** (`@fontsource`), because the CSP allows fonts from our own origin only.
- **Hosting:** Vercel rewrites every non-asset path to `index.html`; GitHub Pages already copies `index.html` to `404.html`. The PWA `start_url` is `./app`.
