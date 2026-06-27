#!/usr/bin/env bash

set -euo pipefail

# Vercel expects:
# - exit 1 => continue with the build
# - exit 0 => cancel the build

BASE_SHA="${VERCEL_GIT_PREVIOUS_SHA:-}"
HEAD_SHA="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

if [[ -z "$BASE_SHA" ]]; then
  echo "No previous deployed SHA found; continuing with build."
  exit 1
fi

if ! git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
  echo "Previous SHA is unavailable locally; continuing with build."
  exit 1
fi

if ! git cat-file -e "${HEAD_SHA}^{commit}" 2>/dev/null; then
  echo "Current SHA is unavailable locally; continuing with build."
  exit 1
fi

if git diff --quiet "$BASE_SHA" "$HEAD_SHA" -- . ':(exclude).github/**'; then
  echo "Only .github changes detected; skipping Vercel build."
  exit 0
fi

echo "Application files changed; continuing with build."
exit 1
