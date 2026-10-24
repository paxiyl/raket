#!/usr/bin/env bash
#
# The production build, as one script so the Render dashboard and this
# repository cannot drift apart.
#
# Order matters: the admin bundle has to exist before the API starts, because
# the API serves it (api/src/index.ts resolves ../../admin/dist relative to
# api/dist). It is built first so a failure there fails the deploy rather than
# producing a running API with no backoffice at /.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$root"

# ---------------------------------------------------------------------------
# `--include=dev` is not optional, and it is the first thing that breaks.
#
# Render sets NODE_ENV=production on a Node service, and npm then skips
# devDependencies — which is where tsc, tsup and vite live. Without this flag
# `npm ci` succeeds, and the build fails two commands later with "vite: not
# found", which reads like a missing dependency rather than a stripped one.
#
# `npm ci`, not `npm install`: both lockfiles are committed, so the build is
# reproducible and a transitive release cannot change what ships.
# ---------------------------------------------------------------------------

echo "==> admin: install"
npm ci --include=dev --prefix admin

echo "==> admin: build"
npm run build --prefix admin

# Checked here rather than discovered at runtime as a 404 on the one URL the
# operator was told to open.
test -f admin/dist/index.html || {
  echo "admin/dist/index.html is missing after the admin build." >&2
  exit 1
}

echo "==> api: install"
npm ci --include=dev --prefix api

# Runs `tsc --noEmit` and then tsup. The typecheck is deliberate: a deploy is
# the last place a type error should be allowed through, and this is a real
# machine rather than the phone that `npm run bundle` exists for.
echo "==> api: typecheck and bundle"
npm run build --prefix api

test -f api/dist/index.js || {
  echo "api/dist/index.js is missing after the API build." >&2
  exit 1
}

echo "==> build complete"
