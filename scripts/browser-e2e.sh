#!/bin/sh
set -eu

REPOSITORY_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
COMPOSE_PROJECT_NAME=${E2E_COMPOSE_PROJECT:-essentials-calls-e2e}
export COMPOSE_PROJECT_NAME
export E2E_COMPOSE_PROJECT=$COMPOSE_PROJECT_NAME
export AMI_USERNAME=${AMI_USERNAME:-visualpbx}
export AMI_SECRET=${AMI_SECRET:-synthetic-e2e-ami-secret-2026}
export PBX_MASTER_KEY=${PBX_MASTER_KEY:-AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=}
export E2E_ADMIN_USERNAME=${E2E_ADMIN_USERNAME:-synthetic-e2e-admin}
export E2E_ADMIN_PASSWORD=${E2E_ADMIN_PASSWORD:-SyntheticE2eAdmin-2026!}
export ACCEPTANCE_ADMIN_PASSWORD=$E2E_ADMIN_PASSWORD
export ACCEPTANCE_EXPECT_ROLLBACK=false
export E2E_VIEWER_PASSWORD=${E2E_VIEWER_PASSWORD:-SyntheticE2eViewer-2026!}
export E2E_EDITOR_PASSWORD=${E2E_EDITOR_PASSWORD:-SyntheticE2eEditor-2026!}
export PBX_ENV=test
export PBX_BACKEND_PORT=${PBX_BACKEND_PORT:-14100}
export PBX_FRONTEND_PORT=${PBX_FRONTEND_PORT:-18180}
export PBX_SIP_PORT=${PBX_SIP_PORT:-15160}
export PBX_AMI_PORT=${PBX_AMI_PORT:-15138}
export PBX_RTP_PORT_RANGE=${PBX_RTP_PORT_RANGE:-11200-11300}
export E2E_BASE_URL=${E2E_BASE_URL:-http://127.0.0.1:$PBX_FRONTEND_PORT}
export E2E_API_URL=${E2E_API_URL:-http://127.0.0.1:$PBX_BACKEND_PORT/api}

compose() {
  docker compose -f "$REPOSITORY_ROOT/docker-compose.yml" -f "$REPOSITORY_ROOT/docker-compose.acceptance.yml" "$@"
}

completed=false
keep_stack=${KEEP_E2E_STACK:-false}

finish() {
  exit_code=$?
  if [ "$completed" != true ]; then
    diagnostic_dir="$REPOSITORY_ROOT/artifacts/browser-failure-$(date -u +%Y%m%dT%H%M%SZ)"
    mkdir -p "$diagnostic_dir"
    compose logs --no-color \
      | sed -E 's/("?(password|secret|token|authorization|cookie|master[_-]?key|pbx_master_key)"?[[:space:]]*[:= ][[:space:]]*"?)[^",;[:space:]]+/\1[REDACTED]/Ig' \
      > "$diagnostic_dir/compose.log" || true
    printf 'Browser failure diagnostics (redacted): %s\n' "$diagnostic_dir" >&2
  fi
  if [ "$keep_stack" != true ]; then
    compose down -v --remove-orphans || true
  fi
  exit "$exit_code"
}
trap finish EXIT INT TERM

cd "$REPOSITORY_ROOT"
compose down -v --remove-orphans
compose up -d --build --wait --wait-timeout 180 asterisk backend frontend
printf '%s\n' "$E2E_ADMIN_PASSWORD" \
  | compose exec -T backend node backend/dist/cli/bootstrapAdmin.js --username "$E2E_ADMIN_USERNAME" --password-stdin
npx playwright test
completed=true
printf 'Essentials+ Calls browser E2E passed with semantic assertions.\n'
