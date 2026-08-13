#!/bin/sh
set -eu

REPOSITORY_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SOURCE_PROJECT=${BACKUP_SOURCE_PROJECT:-essentials-calls-backup-source}
TARGET_PROJECT=${BACKUP_TARGET_PROJECT:-essentials-calls-backup-target}
export AMI_USERNAME=${AMI_USERNAME:-visualpbx}
export AMI_SECRET=${AMI_SECRET:-synthetic-backup-ami-secret-2026}
export PBX_MASTER_KEY=${PBX_MASTER_KEY:-AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM=}
export ACCEPTANCE_ADMIN_PASSWORD=${ACCEPTANCE_ADMIN_PASSWORD:-SyntheticBackupAdmin-2026!}
export ACCEPTANCE_EXPECT_ROLLBACK=false
export PBX_ENV=test
backup_dir=$(mktemp -d)
completed=false

source_compose() {
  PBX_BACKEND_PORT=14200 PBX_FRONTEND_PORT=18280 PBX_SIP_PORT=15260 PBX_AMI_PORT=15238 PBX_RTP_PORT_RANGE=11400-11500 \
    docker compose -p "$SOURCE_PROJECT" -f "$REPOSITORY_ROOT/docker-compose.yml" -f "$REPOSITORY_ROOT/docker-compose.acceptance.yml" "$@"
}

target_compose() {
  PBX_BACKEND_PORT=14300 PBX_FRONTEND_PORT=18380 PBX_SIP_PORT=15360 PBX_AMI_PORT=15338 PBX_RTP_PORT_RANGE=11600-11700 \
    docker compose -p "$TARGET_PROJECT" -f "$REPOSITORY_ROOT/docker-compose.yml" -f "$REPOSITORY_ROOT/docker-compose.acceptance.yml" "$@"
}

finish() {
  exit_code=$?
  if [ "$completed" != true ]; then
    diagnostic_dir="$REPOSITORY_ROOT/artifacts/backup-restore-failure-$(date -u +%Y%m%dT%H%M%SZ)"
    mkdir -p "$diagnostic_dir"
    source_compose logs --no-color 2>/dev/null \
      | sed -E 's/("?(password|secret|token|authorization|cookie)"?[[:space:]]*[:= ][[:space:]]*"?)[^",;[:space:]]+/\1[REDACTED]/Ig' \
      > "$diagnostic_dir/source-compose.log" || true
    target_compose logs --no-color 2>/dev/null \
      | sed -E 's/("?(password|secret|token|authorization|cookie)"?[[:space:]]*[:= ][[:space:]]*"?)[^",;[:space:]]+/\1[REDACTED]/Ig' \
      > "$diagnostic_dir/target-compose.log" || true
    printf 'Backup/restore failure diagnostics (redacted): %s\n' "$diagnostic_dir" >&2
  fi
  source_compose --profile acceptance down -v --remove-orphans || true
  target_compose --profile acceptance down -v --remove-orphans || true
  rm -rf -- "$backup_dir"
  exit "$exit_code"
}
trap finish EXIT INT TERM

cd "$REPOSITORY_ROOT"
source_compose --profile acceptance down -v --remove-orphans
target_compose --profile acceptance down -v --remove-orphans
source_compose --profile acceptance build asterisk backend frontend acceptance
source_compose --profile acceptance up -d --no-build --wait --wait-timeout 180 asterisk backend frontend
printf '%s\n' "$ACCEPTANCE_ADMIN_PASSWORD" \
  | source_compose exec -T backend node backend/dist/cli/bootstrapAdmin.js --username synthetic-admin --password-stdin
source_compose --profile acceptance run --rm acceptance
source_compose exec -T backend node backend/dist/cli/backup.js --output /data/acceptance-backup.tar.gz
source_backend=$(source_compose ps -q backend)
test -n "$source_backend"
docker cp "$source_backend:/data/acceptance-backup.tar.gz" "$backup_dir/acceptance-backup.tar.gz"

manifest=$(tar -xOzf "$backup_dir/acceptance-backup.tar.gz" manifest.json)
printf '%s\n' "$manifest" | grep -q '"product": "Essentials+ Calls"'
printf '%s\n' "$manifest" | grep -q '"masterKeyIncluded": false'
printf '%s\n' "$manifest" | grep -q '"sha256"'

target_compose --profile acceptance build backend asterisk frontend acceptance
target_compose run --rm --no-deps \
  -v "$backup_dir:/restore-input:ro" \
  backend node backend/dist/cli/restore.js --input /restore-input/acceptance-backup.tar.gz
target_compose --profile acceptance up -d --wait --wait-timeout 180 asterisk backend frontend
target_compose --profile acceptance run --rm \
  -e ACCEPTANCE_AFTER_RESTORE=true \
  -e ACCEPTANCE_EXPECT_ROLLBACK=false \
  acceptance

completed=true
printf 'Essentials+ Calls empty restore and post-restore synthetic callflow passed; the master key remained separate.\n'
