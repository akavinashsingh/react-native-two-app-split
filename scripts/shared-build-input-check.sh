#!/usr/bin/env bash
#
# shared-build-input-check.sh
#
# Answers ONE question: does this change end up inside a shipped app, and if so,
# which ones?
#
# The mistake this exists to catch is not writing bad code in the shared package.
# It is forgetting that the file you just edited is a shared build input at all.
#
# It is deliberately FAIL-CLOSED. Do not maintain a list of "dangerous paths",
# you will miss some. Our first version enumerated them and missed the app entry
# point, metro.config.js, babel.config.js, app.json and the whole assets folder.
# Everything under an app directory or the shared directory counts as a build
# input unless it is documentation.
#
# Usage:
#   scripts/shared-build-input-check.sh             # staged changes
#   scripts/shared-build-input-check.sh --working   # staged + unstaged + untracked
#   scripts/shared-build-input-check.sh --strict    # exit 1 if shared code is touched
#
# Configure these three for your repo:
SHARED_DIR="shared"
APP_DIRS=("app-customer" "app-provider")
# Paths that never reach a binary. Extend carefully.
DOC_PATTERN='\.md$|^docs/|^\.github/'

set -euo pipefail

MODE="staged"
STRICT=0
for arg in "$@"; do
  case "$arg" in
    --working) MODE="working" ;;
    --strict)  STRICT=1 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if [ "$MODE" = "working" ]; then
  CHANGED=$( { git diff --name-only; git diff --cached --name-only; \
               git ls-files --others --exclude-standard; } | sort -u )
else
  CHANGED=$(git diff --cached --name-only | sort -u)
fi

if [ -z "$CHANGED" ]; then
  echo "No changes to check ($MODE)."
  exit 0
fi

CODE=$(echo "$CHANGED" | grep -Ev "$DOC_PATTERN" || true)

SHARED_HITS=$(echo "$CODE" | grep -E "^${SHARED_DIR}/" || true)

echo "Build-input check ($MODE)"
echo

APP_TOUCHED=0
for app in "${APP_DIRS[@]}"; do
  hits=$(echo "$CODE" | grep -E "^${app}/" || true)
  if [ -n "$hits" ]; then
    APP_TOUCHED=1
    count=$(echo "$hits" | wc -l | tr -d ' ')
    echo "  ${app}: ${count} file(s)"
    echo "$hits" | sed 's/^/      /'
  fi
done

if [ -n "$SHARED_HITS" ]; then
  count=$(echo "$SHARED_HITS" | wc -l | tr -d ' ')
  echo
  echo "  !! ${SHARED_DIR}/: ${count} file(s). This reaches ALL ${#APP_DIRS[@]} apps."
  echo "$SHARED_HITS" | sed 's/^/      /'
  echo
  echo "  Before committing, confirm for EACH app:"
  echo "    - is it currently live in a store?"
  echo "    - does this change its behaviour or its appearance?"
  echo "    - has it been run on a device since this change?"
fi

if [ "$APP_TOUCHED" = "0" ] && [ -z "$SHARED_HITS" ]; then
  echo "  No app or shared build inputs touched."
fi

if [ "$STRICT" = "1" ] && [ -n "$SHARED_HITS" ]; then
  echo
  echo "Refusing (--strict): shared build inputs changed."
  exit 1
fi

exit 0
