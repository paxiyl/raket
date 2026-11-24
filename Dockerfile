# Raket — one image, two apps, as deployed on Northflank.
#
# No `# syntax=docker/dockerfile:1` line, on purpose: nothing here uses
# BuildKit-only syntax (no `RUN --mount`, no heredocs), and that directive makes
# every build pull the dockerfile frontend image from Docker Hub before it can
# start. Northflank's BuildKit still builds this and still does layer caching —
# that is a build-engine setting, not a Dockerfile one. Add the line only if a
# future change actually needs newer syntax.
#
# This is the container form of `render-build.sh`, and it keeps that script's
# two load-bearing properties:
#
#   1. ORDER. The admin bundle is built before the API, because the API serves
#      it. A failure in the admin build has to fail the image rather than
#      produce a running API with no backoffice at `/`.
#   2. `--include=dev`. NODE_ENV is `production` in this image, and npm then
#      skips devDependencies — which is where `vite`, `tsc` and `tsup` live.
#      Without the flag `npm ci` succeeds and the build dies two lines later
#      with `vite: not found`, which reads like a missing dependency rather
#      than a stripped one.
#
# LAYOUT IS LOAD-BEARING. `api/src/index.ts` resolves the bundle with
# `path.resolve(__dirname, "../../admin/dist")`, and __dirname is wherever
# `api/dist/index.js` ends up. So the runtime stage must be exactly:
#
#   /app/api/dist/index.js      <- the entrypoint
#   /app/admin/dist/index.html  <- what it serves at /
#
# Move either one and the API boots fine and logs
# "Backoffice NOT served: no build found", which is a 404 on the one URL the
# operator was told to open.
#
# Build context is the repository ROOT, not api/. Both apps are needed.

# ---------------------------------------------------------------- admin ----
# Separated from the API build so the two dependency trees get their own
# layers: touching an API file does not reinstall Vite, and vice versa.
FROM node:22.22.0-alpine AS admin-build

WORKDIR /build/admin

# Lockfile first, so `npm ci` is only re-run when dependencies actually change.
COPY admin/package.json admin/package-lock.json ./
RUN npm ci --include=dev

COPY admin/ ./

# `VITE_*` is read by Vite at BUILD time and compiled into the bundle — it is
# not an environment variable the running container can supply. The server can
# be reconfigured with a restart; these need a rebuild. Pass them as Northflank
# build arguments (Configure -> Build -> Build arguments).
#
# Both are optional and both are PUBLIC: they end up in JavaScript that is
# served to every browser. Never put CLOUDINARY_API_SECRET, JWT_SECRET or any
# other server-side value behind a VITE_ prefix.
#
# VITE_API_URL is deliberately left unset by default. Empty means the admin app
# uses the relative `/api/v1`, which is the whole point of the single-origin
# topology — set it only if you later move the admin to its own host, and read
# DEPLOYMENT.md § A separate admin origin first.
#
# The `""` default is safe rather than merely tidy, and it is worth saying why
# because the opposite would be a silent break: both consumers
# (`admin/src/lib/axios-client.ts` and `admin/src/lib/health.ts`) read it with
# `||`, not `??`, so an EMPTY STRING falls through to the production default of
# `/api/v1`. Had either used `??`, this empty default would have produced a
# bundle with `baseURL: ""` and every admin request would have gone to the wrong
# path. If one of them is ever changed to `??`, these ARGs have to stop
# defaulting to `""`.
ARG VITE_API_URL=""
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

# `tsc -b && vite build`.
RUN npm run build

# Asserted here rather than discovered at runtime as a 404.
RUN test -f dist/index.html \
    || (echo "admin/dist/index.html is missing after the admin build." >&2; exit 1)

# ------------------------------------------------------------------ api ----
FROM node:22.22.0-alpine AS api-build

WORKDIR /build/api

COPY api/package.json api/package-lock.json ./
RUN npm ci --include=dev

COPY api/ ./

# `npm run build` is `tsc --noEmit && tsup`. The typecheck is deliberate: a
# deploy is the last place a type error should get through.
RUN npm run build

RUN test -f dist/index.js \
    || (echo "api/dist/index.js is missing after the API build." >&2; exit 1)

# ------------------------------------------------- production node_modules --
# A third stage purely to resolve the runtime dependency tree once, so the
# final image carries neither the dev dependencies nor npm's cache.
FROM node:22.22.0-alpine AS api-deps

WORKDIR /build/api

COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# -------------------------------------------------------------- runtime ----
FROM node:22.22.0-alpine AS runtime

# ---------------------------------------------------------------------------
# No init shim (no tini, no dumb-init), deliberately.
#
# The usual reason to add one is that PID 1 has no default signal dispositions:
# a signal with no handler installed is DISCARDED rather than killing the
# process, so a `node` at PID 1 that ignores SIGTERM gets SIGKILLed by the
# platform at the end of the grace period, mid-request and mid-write.
#
# That does not apply here, and the reason is specific rather than hopeful:
# `src/index.ts` installs explicit `process.once` handlers for SIGTERM and
# SIGINT, and an EXPLICIT handler runs normally at PID 1. It closes the
# listener, then the mongoose connection, and `deploy.check.mjs` asserts that
# the whole shutdown completes inside a platform grace period.
#
# Verified in this image rather than assumed: PID 1 is `node dist/index.js`,
# `docker stop` logs "Shutting down API" then "Database disconnected" 12ms
# later, and the container exits 0 — not 137, which is what a SIGKILLed
# container reports.
#
# The other job of an init — reaping orphaned children — has nothing to reap:
# this process spawns none.
#
# So an init shim here would buy nothing and cost an `apk add` against the
# Alpine CDN on every build. If a future change removes those signal handlers
# or starts spawning child processes, add `tini` back and make it PID 1.
# ---------------------------------------------------------------------------

ENV NODE_ENV=production

# Northflank does NOT inject a PORT variable the way Render does — a container
# listens on whatever port it chooses and the platform routes to it. So the port
# is pinned here and `EXPOSE`d, which is also what lets Northflank auto-detect
# it when the service is created.
#
# The API reads PORT with 8000 as its default, so overriding this variable in
# Northflank's runtime environment still works — just remember to change the
# port in Configure -> Networking to match, or the health check and the public
# URL will point at a port nothing is listening on.
ENV PORT=8000

# ---------------------------------------------------------------------------
# `tsx`, on purpose, in a production image — and installed GLOBALLY, which is
# the part that took two attempts to get right.
#
# WHY IT IS HERE AT ALL. The operational scripts are `tsx ./src/scripts/<name>.ts`
# — `seed:admin` above all. On Render the free plan had no shell, which is the
# entire reason `ADMIN_BOOTSTRAP_EMAIL`/`_PASSWORD` exist: a dashboard variable
# was the only way to create the first administrator. Northflank gives shell
# access, so `npm run seed:admin` becomes the normal route — but only if the
# image you shell into can actually run it. Cost: tsx pulls esbuild, measured
# at 21 MB (404 MB -> 425 MB). That beats leaving a password in a dashboard
# field.
#
# WHY GLOBAL AND NOT IN api/node_modules. Adding it to the project's tree needs
# `npm install` in the api-deps stage, and there is no flag combination that
# does the right thing there:
#   - without `--omit=dev`, npm re-resolves package.json and silently reinstalls
#     every devDependency `npm ci --omit=dev` just excluded (measured: 504 MB
#     instead of 404 MB);
#   - with `--omit=dev`, npm prunes the package it was just asked to add, and
#     `node_modules/.bin/tsx` does not exist at all.
# Neither fails the build. The first only shows up as image size and the second
# only when someone tries to seed an admin.
#
# A global install sidesteps the dev/prod split entirely: it resolves tsx and
# esbuild on their own, writes them to /usr/local/lib/node_modules, and puts
# `tsx` on PATH — so `npm run seed:admin` finds it without the project tree
# carrying it. Run before `USER node` because /usr/local needs root.
#
# Version pinned to the one api/package-lock.json resolves
# (devDependencies."tsx": "^4.23.13" -> 4.23.15). Bump it when the lockfile
# moves.
# ---------------------------------------------------------------------------
RUN npm install -g --no-audit --no-fund tsx@4.23.15 \
    && npm cache clean --force \
    && tsx --version

WORKDIR /app

# `--chown` on each COPY rather than a `chown -R` layer: recursively rewriting
# ownership of node_modules duplicates every file into a new layer and roughly
# doubles the image.
COPY --from=api-deps  --chown=node:node /build/api/node_modules ./api/node_modules
COPY --from=api-build --chown=node:node /build/api/dist         ./api/dist
COPY --from=api-build --chown=node:node /build/api/package.json ./api/package.json

# `src/` is NOT what the server runs — that is `dist/index.js`. It is here so
# the `npm run seed:*`, `reset:demo`, `link:owner` and `sync:indexes` scripts
# work from a shell in this container, which is how the first administrator is
# created now. See the tsx note in the api-deps stage.
COPY --from=api-build --chown=node:node /build/api/src          ./api/src
COPY --from=api-build --chown=node:node /build/api/tsconfig.json ./api/tsconfig.json

# The two levels up that `path.resolve(__dirname, "../../admin/dist")` expects.
COPY --from=admin-build --chown=node:node /build/admin/dist ./admin/dist

# Non-root. The `node` image ships this user; nothing here needs to write to
# the filesystem (uploads go through multer.memoryStorage() straight to
# Cloudinary), so the whole tree can stay read-only to the process.
USER node

WORKDIR /app/api

EXPOSE 8000

# A healthcheck in the image as well as in Northflank's own probe, so
# `docker run` locally tells you the same thing the platform would. Uses Node
# rather than curl, which the alpine image does not carry.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "const p=process.env.PORT||8000;require('http').get({host:'127.0.0.1',port:p,path:'/health'},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# `node dist/index.js` from /app/api, which is exactly what `npm start` runs.
#
# Invoked directly, and in exec form, for two reasons that are the same reason:
# the signal has to reach Node. `npm start` would put an npm process at PID 1
# that does not forward SIGTERM to its child, and the shell form
# (`CMD node dist/index.js`) would put `/bin/sh -c` there, which does not
# forward it either. Both turn a 20ms graceful shutdown into a SIGKILL at the
# end of the grace period.
CMD ["node", "dist/index.js"]
