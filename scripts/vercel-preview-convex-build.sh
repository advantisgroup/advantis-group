#!/usr/bin/env bash
# Wraps a Vercel app's build command so Preview/Development deployments get
# a fresh, branch-scoped Convex backend, while Production keeps building
# exactly as before (production Convex deploys stay owned by
# .github/workflows/convex-deploy.yml, not this script).
#
# Brand-new preview deployments get CLERK_JWT_ISSUER_DOMAIN and
# INTERNAL_CLERK_JWT_ISSUER_DOMAIN automatically via Convex's project-level
# Default Environment Variables (Project Settings > Environment Variables,
# Preview scope) - no CI-side seeding needed.
set -euo pipefail

APP_DIR="$1"   # e.g. apps/intranet, relative to repo root
BUILD_CMD="$2" # e.g. "turbo run build"

ROOT="$(git rev-parse --show-toplevel)"

log() {
  echo "[convex-preview] $(date -u +%FT%TZ) $*"
}

if [ "$VERCEL_ENV" = "production" ]; then
  log "VERCEL_ENV=production - skipping Convex preview deploy, building as-is"
  eval "$BUILD_CMD"
else
  log "VERCEL_ENV=${VERCEL_ENV:-unset} branch=${VERCEL_GIT_COMMIT_REF:-unknown} commit=${VERCEL_GIT_COMMIT_SHA:-unknown} app=$APP_DIR"
  log "claiming/reusing Convex preview deployment for branch '${VERCEL_GIT_COMMIT_REF:-unknown}'"

  DEPLOY_LOG="$(mktemp)"
  trap 'rm -f "$DEPLOY_LOG"' EXIT

  (cd "$ROOT/packages/convex" && npx convex deploy \
    --cmd "cd $ROOT/$APP_DIR && $BUILD_CMD" \
    --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL) | tee "$DEPLOY_LOG"

  CONVEX_URL="$(grep -oE 'https://[a-zA-Z0-9.-]+\.convex\.cloud' "$DEPLOY_LOG" | tail -1 || true)"
  log "resolved backend: ${CONVEX_URL:-<not found in output>} for branch '${VERCEL_GIT_COMMIT_REF:-unknown}'"
  log "if this backend name changed since the last build of this same branch, Convex reclaimed the previous preview deployment (see docs.convex.dev/production/hosting/preview-deployments) - check the Convex dashboard's deployment count against your plan limit"
fi
