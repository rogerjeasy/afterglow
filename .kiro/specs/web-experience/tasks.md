# Web experience — Tasks

Status: `[x]` done, `[ ]` planned. Tests added 2026-11-27 (10 tests, ids WX-01, WX-02: `src/router.test.ts`, `src/styles/theme.test.ts`); WX-03..WX-07 are layout and motion, checked in the browser, and WX-08 is the Playwright pixel scan. The WX-01 property found that `#/constructor` (any name an object inherits) threw before the first render; fixed the same day (`docs/kiro/pbt-catches.md`).

- [x] 1. History router, legacy-link redirect, BASE-aware links — _WX-01_ — `src/router.tsx`, `src/main.tsx`
- [x] 2. Tailwind v4 theme from semantic tokens only; fonts self-hosted — _WX-02, WX-03_ — `src/styles/tailwind.css`
- [x] 3. Shared kit: icons, logo, reveal, CTAs, page frame — _WX-03_ — `src/ui/*`
- [x] 4. Restyle the Night Shell primitives on the theme (buttons, chips, fields, tiles, sources, mode switch, tab bar) — _WX-02_
- [x] 5. Public site: layout, homepage, features, how it works, science and privacy, organisations, pricing, not found — _WX-04_ — `src/site/*`
- [x] 6. Sign-in and sign-up pages over the space controller — _WX-06_ — `src/auth/*`
- [x] 7. Product shell and the Hearth dashboard — _WX-05_ — `src/shell/AppShell.tsx`, `src/screens/Hearth.tsx`
- [x] 8. Every product screen on `Page`/`PageHeader`, responsive grids — _WX-05, WX-07_
- [x] 9. Hosting: Vercel rewrites, PWA start URL — _WX-01_
- [x] 10. Extend the Playwright pixel scan to the public routes and auth pages — _WX-08_
