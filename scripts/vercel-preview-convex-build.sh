#!/usr/bin/env bash
# Wraps a Vercel app's build command so Preview/Development deployments get
# a fresh, branch-scoped Convex backend, while Production keeps building
# exactly as before (production Convex deploys stay owned by
# .github/workflows/convex-deploy.yml, not this script).
#
# A brand-new preview deployment starts with zero configured env vars, which
# fails the deploy as soon as convex/auth.config.ts needs e.g.
# CLERK_JWT_ISSUER_DOMAIN. If the first attempt fails, seed defaults from the
# CONVEX_PREVIEW_ENV_DEFAULTS Vercel env var (Preview-scoped, set once in the
# dashboard to a copy of the production values) and retry once.
#
# The marketplace-integration CONVEX_DEPLOY_KEY is a service token that can
# run `convex deploy` but is rejected by `convex env set`
# (ServiceTokenNotAllowed: requires a member-authenticated key). Seeding
# needs a separately-generated project-level Preview Deploy Key
# (CONVEX_ADMIN_DEPLOY_KEY, Preview-scoped in Vercel) instead.
set -uo pipefail

APP_DIR="$1"   # e.g. apps/intranet, relative to repo root
BUILD_CMD="$2" # e.g. "turbo run build"

ROOT="$(git rev-parse --show-toplevel)"

if [ "$VERCEL_ENV" = "production" ]; then
  eval "$BUILD_CMD"
  exit 0
fi

cd "$ROOT/packages/convex"

deploy() {
  npx convex deploy \
    --cmd "cd $ROOT/$APP_DIR && $BUILD_CMD" \
    --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
}

if deploy; then
  exit 0
fi

if [ -z "${CONVEX_PREVIEW_ENV_DEFAULTS:-}" ]; then
  echo "Convex deploy failed and CONVEX_PREVIEW_ENV_DEFAULTS is not set - cannot auto-seed env vars." >&2
  echo "Set it in Vercel (advantis-group-intranet, Preview scope) to fix this permanently." >&2
  exit 1
fi

if [ -z "${CONVEX_ADMIN_DEPLOY_KEY:-}" ]; then
  echo "Convex deploy failed and CONVEX_ADMIN_DEPLOY_KEY is not set - cannot auto-seed env vars." >&2
  echo "The integration's own CONVEX_DEPLOY_KEY is a service token and can't call 'env set'." >&2
  echo "Generate a project-level Preview Deploy Key in the Convex dashboard and set it as" >&2
  echo "CONVEX_ADMIN_DEPLOY_KEY (Preview scope) in Vercel to fix this permanently." >&2
  exit 1
fi

echo "Convex deploy failed - seeding preview env vars from CONVEX_PREVIEW_ENV_DEFAULTS and retrying once..."
SEED_FILE="$(mktemp)"
trap 'rm -f "$SEED_FILE"' EXIT
printf '%s\n' "$CONVEX_PREVIEW_ENV_DEFAULTS" > "$SEED_FILE"

# No --deployment/--preview-name: this resolves to "this branch's preview
# deployment" the same way `convex deploy` above just did, via the ambient
# git context - just with an admin-capable key swapped in so `env set` is
# allowed.
if ! CONVEX_DEPLOY_KEY="$CONVEX_ADMIN_DEPLOY_KEY" npx convex env set --from-file "$SEED_FILE"; then
  echo "Seeding preview env vars failed - not retrying the deploy." >&2
  exit 1
fi

deploy
