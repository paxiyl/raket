# Deploying Raket on Northflank

One Northflank **combined service** (build + deploy in one), the same MongoDB
Atlas cluster, the same Cloudinary account, and an APK rebuilt against the new
URL.

This replaces [`render.yaml`](render.yaml) and
[`render-build.sh`](render-build.sh). Both are still in the repository, marked
superseded — do not delete them until the Northflank deploy has been verified
against the checklist in [Verifying the deploy](#verifying-the-deploy).

**What moves:** compute only. **What does not:** MongoDB Atlas, Cloudinary, the
Google Cloud OAuth clients, the Expo/EAS project. Nothing in `api/`, `admin/` or
`mobile/` changed to make this work — the topology is identical, and the
Dockerfile is the containerised form of `render-build.sh`.

Steps that need your Northflank, Atlas, Google or Expo account are marked
**`[YOU]`**. Nothing below has been run against a live Northflank account; see
[What could not be verified](#what-could-not-be-verified).

- [Why this is still one service](#why-this-is-still-one-service)
- [The region](#the-region)
- [What the free Sandbox tier gives you](#what-the-free-sandbox-tier-gives-you)
- [1. Create the project](#1-create-the-project)
- [2. Create the combined service](#2-create-the-combined-service)
- [3. Networking](#3-networking)
- [4. Runtime environment variables](#4-runtime-environment-variables)
- [5. Build arguments](#5-build-arguments)
- [6. Health checks](#6-health-checks)
- [7. Atlas network access](#7-atlas-network-access)
- [8. The first administrator](#8-the-first-administrator)
- [9. The mobile app](#9-the-mobile-app)
- [Verifying the deploy](#verifying-the-deploy)
- [What is now dead code](#what-is-now-dead-code)
- [Rolling back to Render](#rolling-back-to-render)
- [Still needs you](#still-needs-you)
- [What could not be verified](#what-could-not-be-verified)

---

## Why this is still one service

Unchanged from `render.yaml`, and worth restating because Northflank makes it
easy to split by accident: the admin SPA is served **by the API**, from the same
origin, so the backoffice session cookie stays `HttpOnly` + `SameSite=Lax`
rather than the third-party `SameSite=None` browsers are restricting. That buys
no CORS, no credentialed preflight, and an admin JWT that JavaScript cannot
read.

Do not create a second Northflank service for a static admin build. It would
cost one of your two free services, require `CORS_ORIGIN`, and move the cookie
to `SameSite=None` — a different security model, with everything
[`DEPLOYMENT.md` § A separate admin origin](DEPLOYMENT.md#a-separate-admin-origin)
lists as a prerequisite.

The layout the API expects is baked into `src/index.ts`:

```ts
const adminDistPath = path.resolve(__dirname, "../../admin/dist");
```

`__dirname` is `/app/api/dist` in the image, so the bundle must land at
`/app/admin/dist`. The Dockerfile's runtime stage does exactly that. Move either
path and the API still boots, logs `Backoffice NOT served: no build found`, and
answers `/` with a 404 — which is the one URL you were told to open.

---

## The region

**Use `Asia Southeast` (`asia-southeast`) — Singapore.**

`Asia South Delhi` (`asia-south-delhi`) is what earlier drafts of this document
specified, on the strength of being ~160 km from Hindaun and inside India
alongside the Atlas cluster. **It is not offered on this account's plan**, so it
was never actually on the table. Singapore is the nearest region that is.

| | |
|---|---|
| Distance to Hindaun, Rajasthan | ~4,000 km — the closest region available on this plan. |
| Distance to the Atlas cluster (Mumbai, `ap-south-1`) | ~3,900 km, roughly 60–80 ms RTT between the API and the database. |
| Previous Render region | `singapore` — **the same region**. |

The last row is the one that decides this. Render was already running in
Singapore, so both distances above are exactly what Raket has today: the
API-to-Atlas hop and the distance to your users are **unchanged** by the move.
There is no latency regression to accept here — and no improvement to claim
either. Latency is simply not what this migration changes.

What it does change is the thing it was for. Render's free plan spun the service
down after about 15 minutes idle, and the next request waited tens of seconds for
the container, Node and the Atlas connection in series. Northflank's free Sandbox
tier is always on, so that wait is gone. That benefit has nothing to do with
region, and not getting Delhi costs none of it.

Northflank's full managed-region list at the time of writing — `africa-south`,
`asia-east`, `asia-northeast`, `asia-south-delhi`, `asia-southeast`,
`australia-southeast`, `canada-central`, `europe-west`, `europe-west-frankfurt`,
`europe-west-netherlands`, `europe-west-zurich`, `southamerica-east`,
`us-central`, `us-east-ohio`, `us-east1`, `us-west`, `us-west-california`.

That is Northflank's catalogue, not the menu a given plan exposes:
`asia-south-delhi` is in the list above and is still unavailable here. The
dropdown at project creation is the authority, not this list.

> **`[YOU]`** Select **`Asia Southeast`** in the region dropdown when you create
> the project. If that dropdown turns out to offer anything closer to Hindaun
> than Singapore, stop and say so before you continue — it would beat this
> choice, and the choice is permanent.

**The region cannot be changed after the project is created.** It belongs to the
project, not the service, and every resource in the project inherits it. Getting
it wrong means deleting the project and starting at step 1.

---

## What the free Sandbox tier gives you

| | |
|---|---|
| Services | 2 — this deploy uses **1** |
| Jobs / cron jobs | 2 — this deploy uses **0** |
| Database addon | 1 — this deploy uses **0** (Atlas stays where it is) |
| Resources | up to $20/month of Northflank Cloud compute |
| Sleeping | **none. Always on.** |
| Shell access | yes, per container |

So you finish this with 1 spare service, 2 spare jobs and an unused addon.

**The thing you are actually buying:** no spin-down. Render's free plan slept
after ~15 minutes idle and the next request waited tens of seconds for the
container, Node, and the Atlas connection in series. Northflank's Sandbox tier
does not sleep, so that wait is gone — see
[What is now dead code](#what-is-now-dead-code) for which client-side machinery
that makes redundant, and why none of it should be deleted yet.

A `$20/month` resource allowance is not the same as *free forever regardless of
size*. `nf-compute-50` (0.5 vCPU / 1 GB) lists at $12/month, which fits; the
1 vCPU / 2 GB plan at $24/month does not. Start at the smallest plan that boots
this image and watch the spend page.

---

## 1. Create the project

> **`[YOU]`** <https://app.northflank.com> → **Create new** → **Project**.
>
> | Field | Value |
> |---|---|
> | Name | `raket` |
> | Region | **Asia Southeast** (see [The region](#the-region)) |
>
> Then **Link your Git account** if you have not already, and grant access to
> this repository. Northflank builds from a branch, so it needs read access to
> the repo and its webhooks.

---

## 2. Create the combined service

A **combined** service is build + deploy in one resource, with CI/CD on by
default — the closest equivalent to what the Render web service was, and it
costs one of your two free services rather than two.

> **`[YOU]`** **Create new** → **Service** → **Combined**.
>
> | Field | Value | Why |
> |---|---|---|
> | Name | `raket-api` | Cannot be changed later. Everything else can. |
> | Repository | this repository | |
> | Branch | your deploy branch (e.g. `main`) | Pushes to it trigger a rebuild. |
> | Build type | **Dockerfile** | Not buildpacks. The build order matters and the Dockerfile encodes it. |
> | Dockerfile path | `/Dockerfile` | |
> | Build context | `/` | **The repository root, not `/api`.** The build needs both apps. |
> | Build engine | **BuildKit** | Required for the layer caching below, and the default. |
> | Resource plan | smallest that boots (start with `nf-compute-50`, 0.5 vCPU / 1 GB) | |
> | Instances | 1 | |
>
> Under **Advanced build settings**, enable **disk caching** if the control is
> available. The two `npm ci` layers are the slow part of this build and they
> only change when a lockfile changes, so caching turns a ~3–5 minute rebuild
> into well under a minute for a code-only change.

The Dockerfile is multi-stage and the stage order is load-bearing:

1. **`admin-build`** — `npm ci --include=dev`, `npm run build` (`tsc -b && vite build`), then asserts `dist/index.html` exists.
2. **`api-build`** — `npm ci --include=dev`, `npm run build` (`tsc --noEmit && tsup`), then asserts `dist/index.js` exists.
3. **`api-deps`** — `npm ci --omit=dev` plus a pinned `tsx`, so the runtime image has production dependencies *and* can run the operational scripts.
4. **`runtime`** — production `node_modules`, `api/dist`, `api/src`, `admin/dist`, non-root `node` user, `EXPOSE 8000`.

`--include=dev` in the two build stages is not decoration. `NODE_ENV` is
`production` in this image and npm then skips `devDependencies`, which is where
`vite`, `tsc` and `tsup` live. Without the flag `npm ci` succeeds and the build
dies two lines later with `vite: not found`. This is the same trap
`render-build.sh` documents at length.

---

## 3. Networking

> **`[YOU]`** During creation, or afterwards at **Configure → Networking**:
>
> | Field | Value |
> |---|---|
> | Port | `8000` |
> | Protocol | **HTTP** |
> | Publicly exposed | **yes** |

Northflank auto-detects ports from the Dockerfile's `EXPOSE`, so `8000` should
already be filled in. Accept it.

**Northflank does not inject `$PORT`.** This is the one real behavioural
difference from Render, and it is why `render.yaml` says *"Render injects PORT
and the app reads it. Do not set it here."* and this document does not. On
Northflank a container listens on whatever port it likes and the platform routes
to it, so the Dockerfile pins `ENV PORT=8000` and exposes it. The API still
reads `PORT` (defaulting to 8000), so overriding it in the runtime environment
works — but if you do, **change the port in Configure → Networking to match**,
or the public URL and the health check will point at a port nothing is listening
on.

You do not need to set `PORT` as a runtime variable. It is already in the image.

Northflank assigns a TLS-terminated public hostname of the form
`p8000--raket-api--<random>.code.run`, and redirects port 80 to 443. Note it
down — it is the URL for the backoffice, the `curl` checks, and the mobile
build.

`app.set("trust proxy", 1)` is already in `src/index.ts`, which is what lets
Express see the original HTTPS hop and actually set `Secure` cookies behind
Northflank's load balancer. No change needed.

---

## 4. Runtime environment variables

**Configure → Environment → Runtime variables.** Mapped one-for-one from
`render.yaml`.

The **Secret?** column is the one to read twice. Northflank stores all of these
encrypted, but "secret" here means *a value that grants access to something and
must never appear in a commit, a screenshot, a log or a support ticket*.

| Variable | Secret? | Value | Notes |
|---|---|---|---|
| `NODE_ENV` | no | `production` | **Required.** Without it the admin SPA is not served at all and cookies are not `Secure`. Already set in the image, but set it explicitly too — it is load-bearing enough to be visible in the dashboard. |
| `MONGODB_URI` | **YES** | `mongodb+srv://…/raket?retryWrites=true&w=majority` | Unchanged from Render. Keep the `/raket` database name before the `?` or everything lands in `test`. |
| `JWT_SECRET` | **YES** | 32+ random characters | See the warning below. |
| `CLOUDINARY_CLOUD_NAME` | no | from the Cloudinary dashboard | Not sensitive on its own, but travels with the pair below. |
| `CLOUDINARY_API_KEY` | **YES** | from the Cloudinary dashboard | |
| `CLOUDINARY_API_SECRET` | **YES** | from the Cloudinary dashboard | **Server-side only.** Never behind a `VITE_*` or `EXPO_PUBLIC_*` prefix — those are compiled into bundles that ship to browsers and phones. |
| `GOOGLE_CLIENT_IDS` | no | the **web** OAuth client ID | Public by design — it ships in the admin bundle and the APK. Empty turns Google sign-in off, which is the shipped default. See [GOOGLE_SIGNIN_SETUP.md](GOOGLE_SIGNIN_SETUP.md). |
| `RAZORPAY_KEY_ID` | no | from Razorpay | The `key_id` is sent to clients by design. |
| `RAZORPAY_KEY_SECRET` | **YES** | from Razorpay | |
| `RAZORPAY_WEBHOOK_SECRET` | **YES** | from Razorpay | Webhook URL becomes `https://<new-host>/api/v1/webhooks/razorpay` — **update it in the Razorpay dashboard**, it still points at Render. |
| `LOG_LEVEL` | no | `info` | |
| `ADMIN_BOOTSTRAP_EMAIL` | no | — | **Do not set.** See [§8](#8-the-first-administrator). |
| `ADMIN_BOOTSTRAP_PASSWORD` | **YES** | — | **Do not set.** See [§8](#8-the-first-administrator). |
| `ADMIN_BOOTSTRAP_NAME` | no | — | **Do not set.** |

Deliberately absent, same as in `render.yaml`:

- **`PORT`** — pinned in the image; see [§3](#3-networking).
- **`CORS_ORIGIN`** — the backoffice is same-origin. An empty allow-list is the safe default. Setting it is a different security model, not a tweak.
- **`FIREBASE_SERVICE_ACCOUNT`** — a *path* to a JSON file, not the JSON. Needs a Northflank [secret file](https://northflank.com/docs/v1/application/secure/upload-secret-files) rather than a variable, and the client half of push is not wired up anyway, so push is off at both ends.
- **`STRIPE_*`** — only with `PAYMENT_PROVIDER=stripe`.

> **`JWT_SECRET`: generate a new one, do not copy Render's.**
>
> `render.yaml` used `generateValue: true`, so Render minted it and you never
> saw it. Northflank has no equivalent, so you generate it:
>
> ```bash
> openssl rand -base64 48
> ```
>
> Reusing Render's would mean a key that has lived in two platforms' logs and
> dashboards. Using a fresh one signs every existing session out, which during a
> migration is the correct outcome, not a problem.
>
> The API **refuses to boot** in production if this is missing, under 32
> characters, or one of the published example values — and one failed boot names
> everything that is wrong, by name, with no values. That is asserted by
> `deploy.check.mjs`.

---

## 5. Build arguments

**This is the step `render.yaml` never had, and it is the reason the admin
Google button could not have worked on Render even with everything else right.**

`VITE_*` variables are read by Vite **at build time** and compiled into the
JavaScript bundle. They are not runtime configuration: a running container
cannot supply them, and changing one requires a **rebuild**, not a restart.
`render.yaml` declares no `VITE_GOOGLE_CLIENT_ID` at all, so any admin bundle
built from that blueprint has `undefined` there — and
`admin/src/components/auth/google-sign-in-button.tsx` opens with:

```tsx
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
// ...
if (!CLIENT_ID) return null;
```

…so the button renders nothing, silently, no matter what the server reports.

**Configure → Build → Build arguments.**

| Build argument | Secret? | Value | Notes |
|---|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | no | the **web** OAuth client ID — the *same string* as `GOOGLE_CLIENT_IDS` | Public: it ships in the bundle. Omit to leave the Google button hidden. |
| `VITE_API_URL` | no | **leave unset** | Empty means the admin app uses the relative `/api/v1`, which is the point of the single-origin topology. Only set it if you move the admin to its own host. |

Both are declared as `ARG` in the Dockerfile's `admin-build` stage, so an unset
one is an empty string rather than a build failure.

**After changing a build argument you must trigger a rebuild**, not a restart. A
restart redeploys the same image, with the same compiled-in values.

To confirm what actually shipped:

```bash
# find the bundle, then look for a client id inside it
curl -s https://<your-host>/ | grep -o 'assets/index-[^"]*\.js'
curl -s https://<your-host>/assets/index-<hash>.js \
  | grep -oiE '[0-9]+-[a-z0-9_]+\.apps\.googleusercontent\.com'
```

No output from the second command means the bundle has no client ID, and the
button will not render regardless of server configuration.

---

## 6. Health checks

> **`[YOU]`** **Configure → Health checks → Add health check.**
>
> | | Readiness probe | Startup probe |
> |---|---|---|
> | Protocol | **HTTP** | **HTTP** |
> | Path | `/health` | `/health` |
> | Port | `8000` | `8000` |
> | Initial delay | ~5 s | ~5 s |
> | Period | ~10 s | ~5 s |
> | Failure threshold | 3 | ~12 |

`/health` is the health check path. It is mounted at the root — **not** under
`/api/v1` — and before the rate limiter, specifically so that a platform health
check never spends a client's rate-limit budget.

Its contract, which is stricter than it looks:

```json
{ "status": "ok", "ready": true, "database": "connected", "uptimeSeconds": 143 }
```

- **200** only when mongoose reports a live connection.
- **503** with `"ready": false` and the real state (`connecting`, `disconnected`, …) otherwise.

Northflank's HTTP probes pass on `200 ≤ status < 400`, so the 503 correctly
fails the probe and takes the instance out of the load balancer.

**Why a startup probe and not just a readiness probe:** the API calls
`connectDatabase()` *before* it listens, so between container start and the
first answer there is a window where nothing is bound to port 8000 at all. A
startup probe with a generous failure threshold covers that window without
making the steady-state readiness probe sloppy; readiness and liveness probes
are suspended until it passes.

**A liveness probe is optional and I would leave it off at first.** `/health`
returns 503 during a transient Atlas failover, and a liveness probe reads that
as "kill the container" — restarting a perfectly healthy process that was
waiting for mongoose to reconnect on its own. Readiness already removes it from
rotation, which is the behaviour you want. Add liveness later if you see
genuinely wedged containers.

---

## 7. Atlas network access

Atlas itself does not move. Its **IP access list** does need attention.

`DEPLOYMENT.md` § 1 explains why Render's free plan forced `0.0.0.0/0`: no
static outbound IP, so there was no address to allow. The same is true of
Northflank's Sandbox tier — a static egress IP needs an
[egress gateway](https://northflank.com/docs/v1/application/network/configure-load-balancers)
(a paid, dedicated-IP feature) or BYOC.

> **`[YOU]`** So for now, leave the Atlas access list as `0.0.0.0/0`, and keep
> the mitigations that make it survivable:
>
> - a long, random, unique password generated by Atlas;
> - that user limited to read/write on the one database — never `atlasAdmin`;
> - no other service sharing the credential;
> - and when this carries real orders, a paid plan with a dedicated egress IP, after which you replace `0.0.0.0/0` with that one address.
>
> This is not a new exposure introduced by the migration — it is the same one
> Render had. It is listed here so it does not quietly survive a migration that
> looked like a good moment to fix it.

---

## 8. The first administrator

**Use the shell. Do not set `ADMIN_BOOTSTRAP_*`.**

The `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` mechanism exists for
exactly one reason, stated in `render.yaml`: *"The first administrator, when
there is no shell to run `npm run seed:admin` in (Render's shell is a paid
feature)."* It creates the account at boot from two dashboard variables, and
then you are supposed to remember to delete them — the boot log warns on every
start while they are still there, because a password sitting in a dashboard
leaks with the dashboard.

**Northflank's free tier has shell access, so that workaround is obsolete.** Do
not carry it over. The variables still work — nothing was removed — but there is
no longer a reason to use them, and one fewer place for a password to sit.

> **`[YOU]`** Service → **Containers** → the running container → **Shell access**.
> Then:
>
> ```bash
> cd /app/api
> npm run seed:admin -- \
>   --email you@yourdomain.com \
>   --password '<a long unique password>'
> ```
>
> Type the password into that shell. Do not put it in a file, a commit, or a
> message. The script never prints it.
>
> In the browser shell, paste with **ctrl-shift-v** (**cmd-v** on macOS).

`NODE_ENV` is already `production` in the container, so there is nothing to
prefix. Two things the script refuses rather than doing quietly: running without
both arguments, and this repository's committed demo credentials
(`admin@chowly.app` / `chowly12345`). It fails before opening the database and
names the command to run instead.

One thing to know before running it against a live database: **an existing
account with the same email is updated, password included.** That is deliberate
— a forgotten test login should be recoverable — but running it with a real
administrator's address resets their password. It is also how you recover a
forgotten one.

Then sign in at `https://<your-host>/login`. The backoffice is admin-only: any
other role is sent to `/no-access`.

**Why this works in the runtime image at all**, since it is a detail that is
easy to break: the seed scripts are `tsx ./src/scripts/<name>.ts`, so the
runtime stage deliberately carries `api/src` and a pinned `tsx` (~23 MB)
alongside the production dependencies. If you slim the image later and the
seeds stop working, that is why. The same applies to `npm run seed:categories`,
`seed:restaurants`, `seed:stores`, `link:owner`, `sync:indexes` and
`reset:demo`.

**Never run `npm run reset:demo` against a database with real orders** — it
drops the seeded catalogue, orders and baskets.

Optional demo catalogue:

```bash
cd /app/api
npm run seed:categories     # the category strips
npm run seed:restaurants    # six example Hindaun kitchens
npm run seed:stores         # one example kirana with real stock
```

---

## 9. The mobile app

The APK has the API URL compiled into it, so it must be rebuilt. `eas.json`
currently pins the Render host in **both** distributable profiles:

```json
"preview":    { "env": { "EXPO_PUBLIC_API_URL": "https://raket-api-7sq3.onrender.com/api/v1" } },
"production": { "env": { "EXPO_PUBLIC_API_URL": "https://raket-api-7sq3.onrender.com/api/v1" } }
```

> **`[YOU]`** Replace both with the Northflank host, keeping the `/api/v1`
> suffix and `https://`:
>
> ```json
> "EXPO_PUBLIC_API_URL": "https://p8000--raket-api--<random>.code.run/api/v1"
> ```
>
> An exported shell variable does **not** reach the EAS build machine — only
> what the profile in `eas.json` declares. `app.config.ts` refuses a
> distributable build with no `EXPO_PUBLIC_API_URL` rather than shipping an APK
> that looks for the API on the phone itself.
>
> While you are in that file, add the Google web client ID too if you want
> Google sign-in in the build — see
> [GOOGLE_SIGNIN_SETUP.md § 6c](GOOGLE_SIGNIN_SETUP.md#6c-mobile--compiled-into-the-apk-needs-a-new-build).
> It is missing from both profiles today.

Then build as before — GitHub Actions (`.github/workflows/android-build.yml`,
paste the new URL when prompted) or `npx eas build --platform android --profile
preview`.

**Update the API before you ship the app.** Most fixes live in the API, so a new
APK against an old API still shows the old behaviour.

`https://` also turns off cleartext HTTP in the build: `app.config.ts` derives
`usesCleartextTraffic` from the URL, so an `https://` API removes the permission
from the manifest by itself. Both hosts are HTTPS, so this is unchanged.

---

## Verifying the deploy

Run all of these against the Northflank host **before** deleting anything
Render-related.

```bash
HOST=https://p8000--raket-api--<random>.code.run

# 1. Readiness, and whether the database is actually connected.
#    Expect 200 and "database":"connected". A 503 means Atlas is not reachable
#    — check the access list (§7) and MONGODB_URI.
curl -i $HOST/health

# 2. The admin shell. Expect 200 and Cache-Control: no-cache.
#    A 404 here means NODE_ENV is not production, or admin/dist did not land.
curl -I $HOST/

# 3. A client-side route must fall back to the shell, not 404.
curl -I $HOST/orders

# 4. An unknown API path must stay JSON, never the admin HTML.
curl -i $HOST/api/v1/not-a-real-route

# 5. The catalogue, which is public.
curl -s $HOST/api/v1/stores | head -c 400

# 6. Fingerprinted assets must be immutable-cached.
curl -I $HOST/assets/$(curl -s $HOST/ | grep -o 'assets/index-[^"]*\.js' | head -1 | cut -d/ -f2)

# 7. What the server thinks is configured for Google.
curl -s $HOST/api/v1/auth/providers

# 8. Whether uploads are on.
curl -s $HOST/api/v1/image-presets | head -c 200
```

Then, in a browser: sign in at `/login`, **reload the page** (the session must
survive, which is what proves the cookie), open an order, and sign out.

And in the Northflank logs, at boot, you should see
`Backoffice served at /` with `from: /app/admin/dist`. If it instead says
`Backoffice NOT served`, the message names which of the two reasons it is.

Locally, the full suite still covers all of this:

```bash
cd admin && npm ci && npm run build
cd ../api && npm ci
npm install --no-save mongodb-memory-server   # once; downloads a MongoDB binary
npm run check
```

**Once every check above passes**, delete the Render service and remove
`render.yaml` and `render-build.sh`. Not before —
[Rolling back](#rolling-back-to-render) depends on them.

---

## What is now dead code

Northflank's Sandbox tier does not sleep, so the ~15-minute spin-down and the
tens-of-seconds cold start that `DEPLOYMENT.md` § *Cold starts on the free plan*
describes are gone.

**Nothing below should be removed.** It is listed because you asked what the
migration makes redundant, and because the honest answer is *"less than it looks
like."* Every item still fires during a **redeploy**, which on Northflank
happens on every push to the deploy branch, and during an **Atlas failover**,
which no hosting change affects. What changes is the *frequency*: from several
times a day on an idle free Render service, to once per deploy.

### Still genuinely useful — keep as-is

| File | Lines | Why it still earns its place |
|---|---|---|
| `mobile/src/lib/health.ts` | 72 | `probeHealth` is also how the app tells "server is up but the database is not" (503 → `degraded`) from "nothing answered". That distinction is not about sleeping. `API_URL_CONFIGURED` is about a mis-built APK. |
| `admin/src/lib/health.ts` | 56 | Same, and it is what `session-boundary.tsx` uses to tell a signed-out 401 from a transport failure. Removing it would re-introduce the bug where a 503 sent an administrator to a login form where the right password also failed. |
| `mobile/src/lib/api-gate.ts` | 63 | The home screen opens 6–7 parallel requests. During a redeploy the gate still collapses those into one wait instead of 6–7 separate "Can't reach Raket" screens behind unopened tabs. Also the single point that guarantees **no request is ever re-sent** — removing it would mean re-examining whether mutations can double-submit. |
| `admin/src/routes/session-boundary.tsx` | 103 | The 401-vs-503 distinction above. Not cold-start-specific. |

### Now over-engineered for the common case — tune, do not delete

| Thing | Where | What is now excessive |
|---|---|---|
| `OVERALL_LIMIT_MS = 120_000` | `mobile/src/features/system/use-api-wake.ts:19`, `admin/src/features/system/use-api-wake.ts:14` | A **two-minute** ceiling was sized for a Render cold start that genuinely took that long. A Northflank redeploy rolls over in seconds. Two minutes of "Starting Raket…" now means something is actually broken, and the customer waits two minutes to be told so. **~20–30 s would be a better ceiling.** This is the single highest-value change in this list. |
| `DELAYS_MS = [1s, 2s, 3s, 5s, 8s, 10s, 10s]` | same two files | Seven escalating probes with a 10 s cap was tuned for a boot that might land anywhere in a 120 s window. With a redeploy-sized wait, the long tail (`8s, 10s, 10s`) is mostly dead. |
| `PROBE_TIMEOUT_MS = 8_000` | same two files | 8 s per probe assumed a container that might not answer at all for a while. Reasonable to halve. |

### Genuinely dead, and still not deletable yet

| Thing | Where | Status |
|---|---|---|
| `ADMIN_BOOTSTRAP_EMAIL` / `_PASSWORD` / `_NAME` | `api/src/config/admin-bootstrap.ts`, `api/src/config/env.config.ts`, `render.yaml` | **The one unambiguous win.** Its entire justification was "Render's shell is a paid feature". Northflank has a shell, so the code path should never run again. Do not delete it: `deploy.check.mjs` asserts its refusals (one variable without the other, a short password, the committed demo password), and it is the only recovery route if shell access is ever unavailable. **Just never set the variables** — [§8](#8-the-first-administrator). |
| The pre-wake caveat in `DEPLOYMENT.md` § *The architecture, and why* | the paragraph beginning *"The cost is one real limitation"* | "When the service is asleep, the browser has nothing to render" is no longer true, and it was the only real argument for a separate admin origin. That argument is now gone, which **strengthens** the single-service topology rather than weakening it. Documentation, not code. |
| Render-specific copy throughout `DEPLOYMENT.md` | `DEPLOYMENT.md` § 3, § 5, § *Cold starts* | Superseded by this document. Rewrite once the deploy is verified. |

### Not dead at all, despite looking it

| Thing | Why it stays |
|---|---|
| `mobile/src/components/api-wake-screen.tsx` (172 lines) | It is also the screen that reports **"this build has no API address"** on a hand-built APK, and the generic "cannot reach Raket" state for a customer whose phone has no signal. Neither is about sleeping. |
| The `/health` endpoint and its 503 policy | Now *more* important, not less: it is Northflank's readiness probe ([§6](#6-health-checks)). Deleting or loosening it would take the health check with it. |
| `retry: false` on mutations in both clients | A correctness property about non-idempotent POSTs, unrelated to hosting. |

**Suggested order, after the deploy is verified:** drop `OVERALL_LIMIT_MS` to
~25 s in both clients, trim the `DELAYS_MS` tail, then rewrite
`DEPLOYMENT.md`'s Render sections to point here. Leave the gate, the health
modules and the bootstrap code alone.

---

## Rolling back to Render

Possible only while `render.yaml` and `render-build.sh` are still in the
repository and the Render service still exists — which is the whole reason they
are kept until the checklist passes.

1. Re-enable (or recreate from the blueprint) the Render service.
2. Re-enter `JWT_SECRET` **and every other secret**. If you generated a new `JWT_SECRET` for Northflank, Render's old one still signs its own sessions — either is fine, but sessions do not transfer between them.
3. Point `eas.json` back at the Render host and rebuild the APK.
4. Atlas and Cloudinary need no change; both platforms reach them the same way.
5. Update the Razorpay webhook URL back.

The Dockerfile is additive — Render's Node runtime ignores it — so it can stay
in the repository either way.

---

## Still needs you

| # | What | Where |
|---|---|---|
| 1 | Create the Northflank project in **Asia Southeast** (Singapore) | [§1](#1-create-the-project), [The region](#the-region) |
| 2 | Link the Git account and create the combined service from `/Dockerfile`, context `/` | [§2](#2-create-the-combined-service) |
| 3 | Confirm port `8000` HTTP, publicly exposed | [§3](#3-networking) |
| 4 | Enter the runtime variables; **generate a fresh `JWT_SECRET`** | [§4](#4-runtime-environment-variables) |
| 5 | Set `VITE_GOOGLE_CLIENT_ID` as a **build argument** if you want the admin Google button | [§5](#5-build-arguments) |
| 6 | Add the readiness and startup probes on `/health` | [§6](#6-health-checks) |
| 7 | Decide what to do about Atlas `0.0.0.0/0` | [§7](#7-atlas-network-access) |
| 8 | Create the first admin **from the shell** | [§8](#8-the-first-administrator) |
| 9 | Update `eas.json` and rebuild the APK | [§9](#9-the-mobile-app) |
| 10 | Update the Razorpay webhook URL to the new host | [§4](#4-runtime-environment-variables) |
| 11 | Run the verification checklist, **then** delete the Render service | [Verifying](#verifying-the-deploy) |

---

## What could not be verified

This container has no Northflank, Atlas, Cloudinary, Google or Expo credentials,
so nothing here has been deployed. What *was* actually executed against this
tree, with `docker build` and `docker run` against a throwaway MongoDB:

| Verified | Result |
|---|---|
| The image builds from this Dockerfile | 425 MB, four stages |
| Layout the API depends on | `path.resolve("/app/api/dist", "../../admin/dist")` → `/app/admin/dist`, `index.html` present |
| It boots and finds the bundle | log: `Database connected`, `API listening port 8000`, `Backoffice served at / from /app/admin/dist` |
| `GET /health` ready | `200 {"status":"ok","ready":true,"database":"connected"}` |
| `GET /health` degraded | with MongoDB stopped: `503 {"status":"degraded","ready":false,"database":"disconnected"}` — which is what makes the readiness probe in [§6](#6-health-checks) correct, and why a liveness probe is a bad idea |
| `GET /` | `200`, `Cache-Control: no-cache`, `text/html` |
| `GET /orders` (SPA fallback) | `200 text/html` |
| `GET /api/v1/not-a-real-route` | `404` JSON, not the admin HTML |
| `GET /api/v1/stores` | `200 {"message":"Stores",...}` |
| Fingerprinted asset | `Cache-Control: public, max-age=31536000` |
| `npm run seed:admin` **from a shell in the container** | created the admin; this is what [§8](#8-the-first-administrator) depends on |
| Login sets the cookie | `Set-Cookie: accessToken=…; HttpOnly; Secure; SameSite=Lax`, and `/auth/me` then succeeds on the cookie alone |
| The image's own `HEALTHCHECK` | reports `healthy` |
| Graceful shutdown with no init shim | PID 1 is `node dist/index.js`; `docker stop` → `Shutting down API`, `Database disconnected` 12 ms later, exit code **0** (not 137) |
| Non-root | runs as `node` |
| Dev dependencies excluded | `vite`, `tsup`, `typescript`, `nodemon` all absent from the runtime image; `express`, `mongoose`, `google-auth-library`, `winston`, `zod` and a working `tsx` all present |
| `npm run check` in `api/` | **passes**, 16 suites, 0 failures, including the new `google-signin.check.mjs` |

One caveat on the build: this sandbox routes HTTPS through a TLS-intercepting
proxy, so the four build stages were run through a temporary wrapper Dockerfile
that added this session's CA certificate. **The Dockerfile in the repository is
the clean one** and needs no such shim on Northflank; every other line of it is
what was executed.

What could not be checked without your accounts:

| | |
|---|---|
| Real API↔Atlas latency from `asia-southeast` to Mumbai | Not measured; the ~60–80 ms above is a distance estimate. Render ran in this same region, so whatever the real figure is, it is the one Raket already has. |
| Whether `nf-compute-50` (0.5 vCPU / 1 GB) is enough to boot this image | The build peaks well above the runtime, but builds run on Northflank's infrastructure, not your service's plan. Watch the first boot; raise the plan if it OOMs. |
| Whether disk caching is enabled for your team | The docs say it "must be available for your team" — contact Northflank support if the control is missing with BuildKit selected. |
| The exact public hostname | Assigned at creation. |
| Whether Atlas accepts connections from Northflank's egress | It will while the access list is `0.0.0.0/0`. Untested against a narrower rule. |
| Real cold-start / redeploy timings | Needs a live deploy. The "always on, no sleeping" claim is from Northflank's own pricing page, not measured. |
| Anything in Google Cloud Console | See [GOOGLE_SIGNIN_SETUP.md](GOOGLE_SIGNIN_SETUP.md). |
