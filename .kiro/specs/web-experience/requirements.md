# Web experience (public site, sign-in, product shell) — Requirements

**Module:** `apps/mobile/src/{router.tsx,Root.tsx,styles/,ui/,site/,auth/,shell/}` and the product screens' layout.
**Workflow:** Design-First. This spec changes presentation and navigation only; it adds no verdict and moves none.
**Design source:** `docs/afterglow-design.md` §4–§10, `.kiro/steering/night-vision.md`.

Until now Afterglow was one 520 px phone column behind `#/` routes, and a first visit landed straight in the product. Judges and new users need a front door: what this is, why it matters, why it can be trusted, and what to tap next. People on a desk need the product to use the width. This spec adds a public site at real paths, dedicated sign-in and sign-up pages, and a responsive product shell, while every night-vision rule keeps holding.

## Requirements

### WX-01 — Real paths, and old links still land
- THE SYSTEM SHALL serve the public site at `/`, `/features`, `/how-it-works`, `/science`, `/organisations`, `/pricing`, sign-in at `/signin`, sign-up at `/signup`, and the product at `/app/...` (`/app`, `/app/lantern`, `/app/seance`, `/app/cold`, `/app/plan`, `/app/alerts`, `/app/account`, `/app/business`, `/app/beacon`, `/app/welcome`).
- WHEN a page is opened with a legacy `#/<tab>` link THE SYSTEM SHALL replace it with the matching `/app/...` path before the first render.
- WHEN a pairing invitation (`#/seance/pair?...`) is opened THE SYSTEM SHALL keep the offer in the hash and open `/app/seance`.
- WHEN `/` is opened with `?tour=1` or `?phase=outage` THE SYSTEM SHALL open `/app` with the same query.
- THE SYSTEM SHALL respect the hosting base path (domain root or a subpath).

### WX-02 — The theme cannot express a forbidden colour
- THE SYSTEM SHALL build its utility theme from the semantic tokens only; the default palette, every shadow, and every text size below 16 px SHALL NOT exist in the theme.
- Every colour utility SHALL resolve to a CSS variable set by `applyMode`, so a mode change repaints the whole page.

### WX-03 — Motion
- THE SYSTEM SHALL animate only `transform` and `opacity`; reveals play once; no ambient loop is added; reduced motion shows content at once.

### WX-04 — Public site
- THE SYSTEM SHALL open the public site in Ember and offer the luminance switch in its header; changing it SHALL dim the whole page.
- Every product claim on the site SHALL match a built feature or be marked as coming to the native app.
- An unknown path SHALL show a not-found page with a clear next step.

### WX-05 — Product shell
- On a desk (≥ 1024 px) THE SYSTEM SHALL show a sidebar with every destination named in costume and in plain words; on smaller screens the five-tab bar.
- THE SYSTEM SHALL show the outage state and timer in the top bar on screens ≥ 768 px.
- The demo space SHALL stay labelled on every product screen.

### WX-06 — Sign-in and sign-up
- THE SYSTEM SHALL offer sign-in and sign-up as their own pages over the existing space controller (cloud and device-only accounts, emailed code, one-time recovery code), with no new credential path.
- WHEN an account is open and no recovery code is waiting THE SYSTEM SHALL send `/signin` and `/signup` to `/app`.

### WX-07 — No overflow
- Every page SHALL render from 320 px to 1440 px wide with no horizontal scroll.

### WX-08 — The pixel scan covers the front door
- The public routes and the sign-in pages SHALL pass the same luminance pixel scan as the product routes (NS-10, NS-11).
