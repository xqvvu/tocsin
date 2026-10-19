#!/usr/bin/env bash
#
# Docker/compose smoke test.
#
# Builds the image, brings the stack up, waits for readiness, asserts the two
# health endpoints actually answer, and tears everything down — including the
# named volume, so a run leaves no state behind and the next one starts clean.
#
# The smoke stack always loads `docker-compose.smoke.yml`: the base file pins
# the image and volume names a real deployment uses, and `down -v` would
# otherwise delete that deployment's `tocsin-data` volume.
#
# This is the automated version of the manual deploy path in `Justfile`. It is
# intentionally not part of `ci.yml`: building an image is slow and the fast gate
# should stay fast. Run it before a release, or from a dedicated workflow.
#
# Usage:  bash scripts/docker-smoke.sh
set -euo pipefail

PROJECT="tocsin-smoke"
PORT="${TOCSIN_SMOKE_PORT:-3100}"
BASE="http://127.0.0.1:${PORT}"
TIMEOUT_SECONDS="${TOCSIN_SMOKE_TIMEOUT:-180}"
SMOKE_IMAGE="tocsin:smoke"
SMOKE_VOLUME="tocsin-smoke-data"

# A fixed secret keeps the run deterministic; this is a throwaway instance and
# the volume is deleted on the way out.
export TOCSIN_HTTP_PORT="${PORT}"
export BETTER_AUTH_SECRET="smoke-test-secret-not-used-anywhere-else-0000000000"
export BETTER_AUTH_URL="${BASE}"
export SERVER_URL="${BASE}"

compose() {
  docker compose \
    -p "${PROJECT}" \
    -f docker-compose.yml \
    -f docker-compose.smoke.yml \
    "$@"
}

cleanup() {
  local status=$?

  # Collect logs before `down`: after the container is gone there is nothing left
  # to read, which used to make every failure report empty.
  if [ "${status}" -ne 0 ]; then
    echo "--- smoke FAILED (exit ${status})"
    echo "--- last logs from the container"
    compose logs --no-color --tail 50 2>/dev/null || true
  fi

  echo "--- tearing down"
  # `-v` removes the named volume too, but only the smoke volume: the override
  # keeps `tocsin-data` out of this project entirely.
  compose down -v --remove-orphans >/dev/null 2>&1 || true

  exit "${status}"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

echo "--- asserting the smoke stack is isolated"
resolved_config=$(compose config)
printf '%s\n' "${resolved_config}" | grep -Eq "image: \"?${SMOKE_IMAGE}\"?" ||
  fail "smoke must use the dedicated ${SMOKE_IMAGE} image"
printf '%s\n' "${resolved_config}" | grep -Eq "name: \"?${SMOKE_VOLUME}\"?" ||
  fail "smoke must use the dedicated ${SMOKE_VOLUME} volume"
if printf '%s\n' "${resolved_config}" | grep -Eq 'name: "?tocsin-data"?'; then
  fail "smoke config still references the production tocsin-data volume"
fi

echo "--- building the image"
compose build

echo "--- starting the stack"
compose up -d

echo "--- waiting for readiness on ${BASE}/api/ready (timeout ${TIMEOUT_SECONDS}s)"
deadline=$((SECONDS + TIMEOUT_SECONDS))
ready_body=""

while [ "${SECONDS}" -lt "${deadline}" ]; do
  # The container's own healthcheck uses /api/ready; readiness is what matters
  # here because it is the endpoint that only answers once dependencies are up.
  if ready_body=$(curl -fsS --connect-timeout 5 --max-time 10 "${BASE}/api/ready" 2>/dev/null); then
    break
  fi

  # Bail early if the container died rather than waiting out the whole timeout.
  if [ "$(compose ps -q console | xargs -r docker inspect -f '{{.State.Running}}' 2>/dev/null)" != "true" ]; then
    fail "the console container is not running"
  fi

  sleep 2
done

[ -n "${ready_body}" ] || fail "/api/ready never returned success within ${TIMEOUT_SECONDS}s"
echo "    /api/ready -> ${ready_body}"

echo "--- asserting liveness"
health_body=$(curl -fsS --connect-timeout 5 --max-time 10 "${BASE}/api/health") ||
  fail "/api/health did not answer"
echo "    /api/health -> ${health_body}"

# The two endpoints must not be the same thing: a liveness probe that reports
# ready would hide a database problem, which is the whole reason both exist.
[ "${health_body}" != "${ready_body}" ] ||
  fail "/api/health and /api/ready returned identical bodies; they should differ"

echo "--- asserting the smoke volume is actually mounted"
mount_source=$(compose ps -q console |
  xargs -r docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')
[ "${mount_source}" = "${SMOKE_VOLUME}" ] ||
  fail "expected /data to mount ${SMOKE_VOLUME}, got ${mount_source:-nothing}"

compose exec -T console sh -c 'test -f /data/tocsin.sqlite' ||
  fail "expected the SQLite database at /data/tocsin.sqlite"

echo "--- asserting the app serves HTML"
# `/` redirects into the dashboard/login flow, so follow it before checking the body.
page=$(curl -fsSL --connect-timeout 5 --max-time 10 "${BASE}/") || fail "/ did not serve a page"
printf '%s' "${page}" | grep -qi '<html' || fail "/ did not serve an HTML document"

echo "--- smoke PASSED"
