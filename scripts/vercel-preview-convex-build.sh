#!/usr/bin/env bash
# Wraps a Vercel app's build command so Preview/Development deployments get
# a fresh, branch-scoped Convex backend, while Production keeps building
# exactly as before (production Convex deploys stay owned by
# .github/workflows/convex-deploy.yml, not this script).
set -euo pipefail

APP_DIR="$1"   # e.g. apps/intranet, relative to repo root
BUILD_CMD="$2" # e.g. "turbo run build"

ROOT="$(git rev-parse --show-toplevel)"

if [ "$VERCEL_ENV" = "production" ]; then
  eval "$BUILD_CMD"
else
  (cd "$ROOT/packages/convex" && npx convex deploy \
    --cmd "cd $ROOT/$APP_DIR && $BUILD_CMD" \
    --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL)
fi
