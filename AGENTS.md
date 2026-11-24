# OnlineMall (Hindaun)

A local quick-commerce marketplace for Hindaun City, Rajasthan, in three apps.
Grew out of the Chowly food-delivery platform; restaurant ordering is retained
alongside the product catalogue. Internal identifiers still read `chowly` in
places and are deliberately left alone — see the transformation plan.

- `api/` — TypeScript Express 5 API (`/api/v1`), MongoDB + Mongoose, Passport JWT.
- `mobile/` — Expo SDK 57 + expo-router app serving both customers and drivers, routed by role.
- `admin/` — Vite + React 19 backoffice.

## Project documents

- [DEPLOYMENT.md](DEPLOYMENT.md) — **current hosting.** Render, Singapore,
  free plan, kept awake by an external pinger. The one-service topology and why
  it keeps the admin cookie same-origin, Atlas and Cloudinary setup, the
  environment variables, the safe admin seed, the mobile release, and the
  cold-start behaviour both clients are built for.
- [NORTHFLANK.md](NORTHFLANK.md) — **prepared, not deployed.** A finished
  Northflank migration, unused because Northflank wanted a payment method that
  was not available and its free plan reaches no nearer than London (~7,200 km
  to the Mumbai Atlas cluster, against ~3,900 km from Singapore). Kept, with the
  root `Dockerfile` and `.dockerignore`, for when a card exists or Render's free
  plan changes. Do not follow it as current, and do not delete it.
- [GOOGLE_SIGNIN_SETUP.md](GOOGLE_SIGNIN_SETUP.md) — the Google Cloud Console
  setup in order, which client id goes where and why the web one goes in all
  three places, and a numbered failure table from build-time configuration down
  to the auth cookie.
- [OnlineMall transformation plan](docs/plans/2026-10-06-onlinemall-transformation.md) —
  current source of truth: decisions taken, phase status, and the checklist.design audit.
- [Chowly v1 plan](docs/plans/2026-09-03-chowly-v1.md) — specification, confirmed decisions,
  assumptions, risks, and the M0–M4 implementation plan. Source of truth for v1 scope; update it in
  place rather than creating a second plan.
- [OnlineMall design](docs/design/onlinemall-design.md) — the live visual system
  (green palette, Inter, spacing/radii, motion, haptics). Build from these values.
- [Chowly mobile design](docs/design/mobile-design.md) — superseded; still describes the
  restaurant screens not yet restyled (teal palette,
  Inter, spacing/radii), screen inventory, states, asset prompts, and the board prompt. Build screens
  from these values; do not invent new tokens.

## Notes for agents

- `mobile/AGENTS.md` applies inside `mobile/` — read the versioned Expo 57 docs before writing Expo code.
- The `api` dev runner is `tsx` (not `ts-node`, which is incompatible with the installed TypeScript 7).
