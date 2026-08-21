#!/bin/sh
set -eu

REPOSITORY_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-essentials-calls-acceptance}
export COMPOSE_PROJECT_NAME
export AMI_USERNAME=${AMI_USERNAME:-visualpbx}
export AMI_SECRET=${AMI_SECRET:-synthetic-ami-secret-2026}
export PBX_MASTER_KEY=${PBX_MASTER_KEY:-AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=}
export ACCEPTANCE_ADMIN_PASSWORD=${ACCEPTANCE_ADMIN_PASSWORD:-SyntheticAdminPass-2026!}
export ACCEPTANCE_EXPECT_ROLLBACK=true
export PBX_ENV=test
export PBX_BACKEND_PORT=${PBX_BACKEND_PORT:-14000}
export PBX_FRONTEND_PORT=${PBX_FRONTEND_PORT:-18080}
export PBX_SIP_PORT=${PBX_SIP_PORT:-15060}
export PBX_AMI_PORT=${PBX_AMI_PORT:-15038}
export PBX_RTP_PORT_RANGE=${PBX_RTP_PORT_RANGE:-11000-11100}

compose() {
  docker compose -f "$REPOSITORY_ROOT/docker-compose.yml" -f "$REPOSITORY_ROOT/docker-compose.acceptance.yml" "$@"
}

keep_stack=${KEEP_ACCEPTANCE_STACK:-false}
completed=false

collect_failure() {
  diagnostic_dir="$REPOSITORY_ROOT/artifacts/acceptance-failure-$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$diagnostic_dir"
  compose logs --no-color \
    | sed -E 's/("?(password|secret|token|authorization|cookie|master[_-]?key|pbx_master_key)"?[[:space:]]*[:= ][[:space:]]*"?)[^",;[:space:]]+/\1[REDACTED]/Ig' \
    > "$diagnostic_dir/compose.log"
  docker run --rm \
    -v "${COMPOSE_PROJECT_NAME}_acceptance-artifacts:/source:ro" \
    -v "$diagnostic_dir:/target" \
    alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce sh -c 'cp -a /source/. /target/ 2>/dev/null || true'
  printf 'Failure diagnostics (redacted): %s\n' "$diagnostic_dir" >&2
}

finish() {
  exit_code=$?
  if [ "$completed" != true ]; then
    collect_failure || true
  fi
  if [ "$keep_stack" != true ]; then
    compose --profile acceptance down -v --remove-orphans || true
  fi
  exit "$exit_code"
}
trap finish EXIT INT TERM

cd "$REPOSITORY_ROOT"
compose --profile acceptance down -v --remove-orphans
compose --profile acceptance build asterisk backend frontend acceptance
compose --profile acceptance up -d --no-build --wait --wait-timeout 180 asterisk backend frontend

startup_log=$(compose logs --no-color asterisk)
if printf '%s\n' "$startup_log" | grep -Eiq "ERROR.*(generated/current|pjsip\.conf.*invalid|extensions\.conf.*invalid|queues\.conf.*invalid|voicemail\.conf.*invalid)|Error loading module|declined to load|Some non-required modules failed to load|Could not find option"; then
  printf 'Asterisk reported a relevant startup configuration error.\n' >&2
  exit 1
fi

printf '%s\n' "$ACCEPTANCE_ADMIN_PASSWORD" \
  | compose exec -T backend node backend/dist/cli/bootstrapAdmin.js --username synthetic-admin --password-stdin

compose --profile acceptance run --rm acceptance

compose restart asterisk backend
compose up -d --wait --wait-timeout 120 asterisk backend frontend
compose --profile acceptance run --rm \
  -e ACCEPTANCE_AFTER_RESTART=true \
  -e ACCEPTANCE_EXPECT_ROLLBACK=false \
  -e ACCEPTANCE_SOURCE_EVIDENCE=/artifacts/recovery-state.json \
  acceptance

completed=true
printf 'Simple Calls full-stack acceptance passed (synthetic local telephony only).\n'
