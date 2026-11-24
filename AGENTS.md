# OnlineMall (Hindaun)

A local quick-commerce marketplace for Hindaun City, Rajasthan, in three apps.
Grew out of the Chowly food-delivery platform; restaurant ordering is retained
alongside the product catalogue. Internal identifiers still read `chowly` in
places and are deliberately left alone — see the transformation plan.

- `api/` — TypeScript Express 5 API (`/api/v1`), MongoDB + Mongoose, Passport JWT.
- `mobile/` — Expo SDK 57 + expo-router app serving both customers and drivers, routed by role.
- `admin/` — Vite + React 19 backoffice.

## Project documents

- [NORTHFLANK.md](NORTHFLANK.md) — **current hosting.** The Northflank deploy:
  the Dockerfile, the region (europe-west/London, and what that costs), the
  environment-variable and build-argument tables, the health checks, seeding
  the first admin from the container shell, and an inventory of what the move
  off a sleeping free tier makes redundant.
- [GOOGLE_SIGNIN_SETUP.md](GOOGLE_SIGNIN_SETUP.md) — the Google Cloud Console
  setup in order, which client id goes where and why the web one goes in all
  three places, and a numbered failure table from build-time configuration down
  to the auth cookie.
- [DEPLOYMENT.md](DEPLOYMENT.md) — the Render topology and why it keeps the
  admin cookie same-origin, Atlas and Cloudinary setup, the environment
  variables, the safe admin seed, the mobile release, and the free-tier
  cold-start behaviour both clients are built for. **The hosting sections are
  superseded by NORTHFLANK.md**; the architecture, Atlas, Cloudinary and mobile
  sections still apply.
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
