#!/bin/sh
set -eu

REPOSITORY_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SOURCE_PROJECT=${BACKUP_SOURCE_PROJECT:-essentials-calls-backup-source}
TARGET_PROJECT=${BACKUP_TARGET_PROJECT:-essentials-calls-backup-target}
ROTATED_TARGET_PROJECT=${BACKUP_ROTATED_TARGET_PROJECT:-essentials-calls-backup-rotated-target}
export AMI_USERNAME=${AMI_USERNAME:-visualpbx}
export AMI_SECRET=${AMI_SECRET:-synthetic-backup-ami-secret-2026}
KEY_A=${BACKUP_TEST_KEY_A:-AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM=}
KEY_B=${BACKUP_TEST_KEY_B:-BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ=}
KEY_C=${BACKUP_TEST_KEY_C:-BQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU=}
export PBX_MASTER_KEY=$KEY_A
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

rotated_target_compose() {
  PBX_BACKEND_PORT=14400 PBX_FRONTEND_PORT=18480 PBX_SIP_PORT=15460 PBX_AMI_PORT=15438 PBX_RTP_PORT_RANGE=11800-11900 \
    docker compose -p "$ROTATED_TARGET_PROJECT" -f "$REPOSITORY_ROOT/docker-compose.yml" -f "$REPOSITORY_ROOT/docker-compose.acceptance.yml" "$@"
}

finish() {
  exit_code=$?
  if [ "$completed" != true ]; then
    diagnostic_dir="$REPOSITORY_ROOT/artifacts/backup-restore-failure-$(date -u +%Y%m%dT%H%M%SZ)"
    mkdir -p "$diagnostic_dir"
    source_compose logs --no-color 2>/dev/null \
      | sed -E 's/("?(password|secret|token|authorization|cookie|master[_-]?key|pbx_master_key)"?[[:space:]]*[:= ][[:space:]]*"?)[^",;[:space:]]+/\1[REDACTED]/Ig' \
      > "$diagnostic_dir/source-compose.log" || true
    target_compose logs --no-color 2>/dev/null \
      | sed -E 's/("?(password|secret|token|authorization|cookie|master[_-]?key|pbx_master_key)"?[[:space:]]*[:= ][[:space:]]*"?)[^",;[:space:]]+/\1[REDACTED]/Ig' \
      > "$diagnostic_dir/target-compose.log" || true
    rotated_target_compose logs --no-color 2>/dev/null \
      | sed -E 's/("?(password|secret|token|authorization|cookie|master[_-]?key|pbx_master_key)"?[[:space:]]*[:= ][[:space:]]*"?)[^",;[:space:]]+/\1[REDACTED]/Ig' \
      > "$diagnostic_dir/rotated-target-compose.log" || true
    printf 'Backup/restore failure diagnostics (redacted): %s\n' "$diagnostic_dir" >&2
  fi
  source_compose --profile acceptance down -v --remove-orphans || true
  target_compose --profile acceptance down -v --remove-orphans || true
  rotated_target_compose --profile acceptance down -v --remove-orphans || true
  rm -rf -- "$backup_dir"
  exit "$exit_code"
}
trap finish EXIT INT TERM

cd "$REPOSITORY_ROOT"
source_compose --profile acceptance down -v --remove-orphans
target_compose --profile acceptance down -v --remove-orphans
rotated_target_compose --profile acceptance down -v --remove-orphans
source_compose --profile acceptance build asterisk backend frontend acceptance
source_compose --profile acceptance up -d --no-build --wait --wait-timeout 180 asterisk backend frontend
printf '%s\n' "$ACCEPTANCE_ADMIN_PASSWORD" \
  | source_compose exec -T backend node backend/dist/cli/bootstrapAdmin.js --username synthetic-admin --password-stdin
source_compose --profile acceptance run --rm acceptance
source_compose exec -T backend node backend/dist/cli/backup.js --output /data/acceptance-backup-a.tar.gz
source_backend=$(source_compose ps -q backend)
test -n "$source_backend"
docker cp "$source_backend:/data/acceptance-backup-a.tar.gz" "$backup_dir/acceptance-backup-a.tar.gz"

manifest=$(tar -xOzf "$backup_dir/acceptance-backup-a.tar.gz" manifest.json)
printf '%s\n' "$manifest" | grep -q '"product": "Essentials+ Calls"'
printf '%s\n' "$manifest" | grep -q '"masterKeyIncluded": false'
printf '%s\n' "$manifest" | grep -q '"sha256"'
printf '%s\n' "$manifest" | grep -q '"secretKeyIds"'
if tar -xOzf "$backup_dir/acceptance-backup-a.tar.gz" | grep -aF "$KEY_A" >/dev/null; then
  printf 'Master key A was found inside the ordinary backup archive.\n' >&2
  exit 1
fi
if tar -xOzf "$backup_dir/acceptance-backup-a.tar.gz" | grep -aEq 'synthetic-(101|102|103)-pass-2026'; then
  printf 'Plaintext SIP credentials were found inside the ordinary backup archive.\n' >&2
  exit 1
fi

target_compose --profile acceptance build backend asterisk frontend acceptance
if PBX_MASTER_KEY="$KEY_B" target_compose run --rm --no-deps \
  -v "$backup_dir:/restore-input:ro" \
  backend node backend/dist/cli/restore.js --input /restore-input/acceptance-backup-a.tar.gz \
  > "$backup_dir/wrong-key-b.log" 2>&1; then
  printf 'Restore with wrong key B unexpectedly succeeded.\n' >&2
  exit 1
fi
grep -Eq 'anderen Master-Key|konnte nicht authentifiziert' "$backup_dir/wrong-key-b.log"
if grep -F "$KEY_A" "$backup_dir/wrong-key-b.log" >/dev/null || grep -F "$KEY_B" "$backup_dir/wrong-key-b.log" >/dev/null; then
  printf 'Wrong-key diagnostics leaked raw master-key material.\n' >&2
  exit 1
fi

PBX_MASTER_KEY="$KEY_A" target_compose run --rm --no-deps \
  -v "$backup_dir:/restore-input:ro" \
  backend node backend/dist/cli/restore.js --input /restore-input/acceptance-backup-a.tar.gz
PBX_MASTER_KEY="$KEY_A" target_compose run --rm --no-deps \
  backend node backend/dist/cli/verifyRecovery.js
PBX_MASTER_KEY="$KEY_A" target_compose --profile acceptance up -d --wait --wait-timeout 180 asterisk backend frontend
PBX_MASTER_KEY="$KEY_A" target_compose --profile acceptance run --rm \
  -e ACCEPTANCE_AFTER_RESTORE=true \
  -e ACCEPTANCE_EXPECT_ROLLBACK=false \
  -e ACCEPTANCE_SOURCE_EVIDENCE=/source-evidence/recovery-state.json \
  -v "${SOURCE_PROJECT}_acceptance-artifacts:/source-evidence:ro" \
  acceptance

source_compose exec -T \
  -e PBX_MASTER_KEY="$KEY_A" \
  -e PBX_NEW_MASTER_KEY="$KEY_C" \
  backend node backend/dist/cli/rotateMasterKey.js
source_compose exec -T \
  -e PBX_MASTER_KEY="$KEY_C" \
  backend node backend/dist/cli/backup.js --output /data/acceptance-backup-c.tar.gz
docker cp "$source_backend:/data/acceptance-backup-c.tar.gz" "$backup_dir/acceptance-backup-c.tar.gz"

rotated_manifest=$(tar -xOzf "$backup_dir/acceptance-backup-c.tar.gz" manifest.json)
printf '%s\n' "$rotated_manifest" | grep -q '"masterKeyIncluded": false'
printf '%s\n' "$rotated_manifest" | grep -q '"secretKeyIds"'
if tar -xOzf "$backup_dir/acceptance-backup-c.tar.gz" | grep -aF "$KEY_C" >/dev/null; then
  printf 'Master key C was found inside the rotated backup archive.\n' >&2
  exit 1
fi

rotated_target_compose --profile acceptance build backend asterisk frontend acceptance
if PBX_MASTER_KEY="$KEY_A" rotated_target_compose run --rm --no-deps \
  -v "$backup_dir:/restore-input:ro" \
  backend node backend/dist/cli/restore.js --input /restore-input/acceptance-backup-c.tar.gz \
  > "$backup_dir/old-key-a.log" 2>&1; then
  printf 'Rotated backup unexpectedly restored with old key A.\n' >&2
  exit 1
fi
grep -Eq 'anderen Master-Key|konnte nicht authentifiziert' "$backup_dir/old-key-a.log"
if grep -F "$KEY_A" "$backup_dir/old-key-a.log" >/dev/null || grep -F "$KEY_C" "$backup_dir/old-key-a.log" >/dev/null; then
  printf 'Old-key diagnostics leaked raw master-key material.\n' >&2
  exit 1
fi

PBX_MASTER_KEY="$KEY_C" rotated_target_compose run --rm --no-deps \
  -v "$backup_dir:/restore-input:ro" \
  backend node backend/dist/cli/restore.js --input /restore-input/acceptance-backup-c.tar.gz
PBX_MASTER_KEY="$KEY_C" rotated_target_compose run --rm --no-deps \
  backend node backend/dist/cli/verifyRecovery.js --expect-rotation
PBX_MASTER_KEY="$KEY_C" rotated_target_compose --profile acceptance up -d --wait --wait-timeout 180 asterisk backend frontend
PBX_MASTER_KEY="$KEY_C" rotated_target_compose --profile acceptance run --rm \
  -e ACCEPTANCE_AFTER_RESTORE=true \
  -e ACCEPTANCE_EXPECT_ROLLBACK=false \
  -e ACCEPTANCE_EXPECT_ROTATION_AUDIT=true \
  -e ACCEPTANCE_SOURCE_EVIDENCE=/source-evidence/recovery-state.json \
  -v "${SOURCE_PROJECT}_acceptance-artifacts:/source-evidence:ro" \
  acceptance

completed=true
printf 'Essentials+ Calls recovery passed: wrong keys failed closed, A and rotated C restored, sessions were invalidated, and post-restore WAV/RTP callflows passed.\n'
