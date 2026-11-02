#!/usr/bin/env bash
# Decides the version and release kind for a workflow run.
#
# Git tags are the source of truth: the latest full release is the highest
# vMAJOR.MINOR.PATCH tag (no suffix). Everything else is derived from it.
#
#   push to main      → prerelease  MAJOR.MINOR.(PATCH+1)-pre.<run number>
#   pull request      → build only  MAJOR.MINOR.(PATCH+1)-pr.<pr>.<run number>
#   workflow_dispatch → release     INPUT_VERSION, or latest bumped by INPUT_BUMP
#   push of a v* tag  → release     the tag (prerelease if it has a "-suffix")
#
# Inputs (env): GITHUB_EVENT_NAME, GITHUB_REF_TYPE, GITHUB_REF_NAME, GITHUB_RUN_NUMBER,
#               PR_NUMBER, INPUT_VERSION, INPUT_BUMP
# Outputs (to $GITHUB_OUTPUT, or stdout): version, kind (build|prerelease|release), latest
set -euo pipefail

out() { echo "$1=$2" >> "${GITHUB_OUTPUT:-/dev/stdout}"; }
fail() { echo "::error::$1" >&2; exit 1; }
is_semver() { [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; }

LATEST_TAG=$(git tag --list 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n1 || true)
if [ -n "$LATEST_TAG" ]; then
  LATEST=${LATEST_TAG#v}
else
  LATEST=$(node -p "require('./package.json').version")   # no releases yet
fi
IFS=. read -r MAJOR MINOR PATCH <<< "${LATEST%%-*}"
NEXT_PATCH="$MAJOR.$MINOR.$((PATCH + 1))"

case "${GITHUB_EVENT_NAME}" in
  pull_request)
    VERSION="$NEXT_PATCH-pr.${PR_NUMBER:-0}.${GITHUB_RUN_NUMBER}"
    KIND=build
    ;;
  workflow_dispatch)
    if [ -n "${INPUT_VERSION:-}" ]; then
      VERSION=${INPUT_VERSION#v}
    else
      case "${INPUT_BUMP:-patch}" in
        major) VERSION="$((MAJOR + 1)).0.0" ;;
        minor) VERSION="$MAJOR.$((MINOR + 1)).0" ;;
        patch) VERSION="$NEXT_PATCH" ;;
        *) fail "Unknown bump '${INPUT_BUMP}'" ;;
      esac
    fi
    [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Release version must be MAJOR.MINOR.PATCH, got '$VERSION'"
    git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null && fail "Tag v$VERSION already exists"
    if [ -n "$LATEST_TAG" ] && [ "$(printf '%s\n%s\n' "$LATEST" "$VERSION" | sort -V | tail -n1)" != "$VERSION" ]; then
      fail "v$VERSION is not newer than the latest release $LATEST_TAG"
    fi
    KIND=release
    ;;
  push)
    if [ "${GITHUB_REF_TYPE}" = "tag" ]; then
      VERSION=${GITHUB_REF_NAME#v}
      if [[ "$VERSION" == *-* ]]; then KIND=prerelease; else KIND=release; fi
    else
      VERSION="$NEXT_PATCH-pre.${GITHUB_RUN_NUMBER}"
      KIND=prerelease
    fi
    ;;
  *) fail "Unsupported event '${GITHUB_EVENT_NAME}'" ;;
esac

is_semver "$VERSION" || fail "Computed version '$VERSION' is not valid semver"
echo "Latest release: ${LATEST_TAG:-none} → $KIND $VERSION" >&2
out version "$VERSION"
out kind "$KIND"
out latest "${LATEST_TAG}"
