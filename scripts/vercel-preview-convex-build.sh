#!/usr/bin/env bash
# Wraps a Vercel app's build command so Preview/Development deployments get
# a fresh, branch-scoped Convex backend, while Production keeps building
# exactly as before (production Convex deploys stay owned by
# .github/workflows/convex-deploy.yml, not this script).
#
# A brand-new preview deployment starts with zero configured env vars, which
# fails the deploy as soon as convex/auth.config.ts needs e.g.
# CLERK_JWT_ISSUER_DOMAIN.
#
# There is currently no way to auto-seed this from CI: `convex env set` is
# rejected for any project-scoped deploy key (ServiceTokenNotAllowed -
# confirmed for both the marketplace integration's CONVEX_DEPLOY_KEY and a
# manually-generated project-level Preview Deploy Key). Only a
# deployment-specific key (generated from that one deployment's own
# dashboard settings page, which only exists *after* the deployment is first
# created) or a personal Convex login can call `env set`. So the first build
# on a new branch needs one manual step - see the message below.
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

cat >&2 <<'EOF'
Convex deploy failed - this is expected on a brand-new preview deployment,
which starts with zero configured env vars (e.g. CLERK_JWT_ISSUER_DOMAIN).

No project-scoped deploy key is allowed to seed env vars on it
(ServiceTokenNotAllowed), so this needs one manual step:

  1. Convex Dashboard -> convex-cinnabar-pillar -> Previews -> find this
     branch's deployment -> Settings -> generate a deploy key for it.
  2. $env:CONVEX_DEPLOY_KEY = "<that key>"
     npx convex env set --from-file <a copy of the production env vars>
  3. Redeploy this branch in Vercel.

Every subsequent build on this branch will succeed without repeating this,
since the deployment keeps its env vars once seeded.
EOF
exit 1
