#!/bin/sh
set -eu

PREFLIGHT_ROOT=/etc/asterisk/generated/preflight
MODULE_DIR=/usr/lib/x86_64-linux-gnu/asterisk/modules

mkdir -p "$PREFLIGHT_ROOT"

write_result() {
  deployment_id="$1"
  result="$2"
  temporary="$PREFLIGHT_ROOT/$deployment_id.result.tmp"
  final="$PREFLIGHT_ROOT/$deployment_id.result"
  printf '%s\n' "$result" > "$temporary"
  chmod 0640 "$temporary"
  mv -f "$temporary" "$final"
}

sanitize_failure() {
  log_file="$1"
  tail -n 30 "$log_file" \
    | sed -E 's/(password|secret|authorization|cookie)[=:][^ ,;]*/\1=[REDACTED]/Ig' \
    | tr '\n' ' ' \
    | cut -c1-900
}

validate_request() {
  request="$1"
  deployment_id="$(basename "$request" .request)"
  case "$deployment_id" in
    *[!A-Za-z0-9_-]*|'')
      rm -f "$request"
      return
      ;;
  esac

  candidate="/etc/asterisk/generated/versions/$deployment_id"
  work="/tmp/essentials-calls-preflight-$deployment_id"
  rm -rf "$work"
  mkdir -p "$work/etc" "$work/run" "$work/log" "$work/spool" "$work/db" "$work/keys"
  cp -a /etc/asterisk/. "$work/etc/"

  if [ ! -r "$candidate/pjsip_generated.conf" ] \
    || [ ! -r "$candidate/extensions_generated.conf" ] \
    || [ ! -r "$candidate/queues_generated.conf" ] \
    || [ ! -r "$candidate/voicemail_generated.conf" ]; then
    write_result "$deployment_id" 'error candidate files are missing or unreadable'
    rm -rf "$work"
    rm -f "$request"
    return
  fi

  cat > "$work/etc/asterisk.conf" <<EOF
[directories]
astetcdir => $work/etc
astmoddir => $MODULE_DIR
astvarlibdir => /var/lib/asterisk
astdbdir => $work/db
astkeydir => $work/keys
astdatadir => /usr/share/asterisk
astagidir => /usr/share/asterisk/agi-bin
astspooldir => $work/spool
astrundir => $work/run
astlogdir => $work/log
astsbindir => /usr/sbin

[options]
verbose = 0
debug = 0
nofork = yes
documentation_language = en_US
EOF

  cat > "$work/etc/manager.conf" <<EOF
[general]
enabled = no
EOF

  cat >> "$work/etc/modules.conf" <<EOF
noload => chan_iax2.so
noload => chan_dahdi.so
EOF

  cat > "$work/etc/pjsip.conf" <<EOF
[global]
type=global
#include $candidate/pjsip_generated.conf
EOF

  cat > "$work/etc/extensions.conf" <<EOF
[general]
static=yes
writeprotect=no
clearglobalvars=no
[globals]
#include $candidate/extensions_generated.conf
EOF

  cat > "$work/etc/queues.conf" <<EOF
[general]
autofill=yes
#include $candidate/queues_generated.conf
EOF

  cat > "$work/etc/voicemail.conf" <<EOF
[general]
format=wav49|gsm|wav
serveremail=Essentials+ Calls <pbx@localhost>
attach=yes
maxmsg=100
maxsecs=300
minsecs=1
[default]
#include $candidate/voicemail_generated.conf
EOF

  chown -R asterisk:asterisk "$work"

  startup_log="$work/startup.log"
  /usr/sbin/asterisk -f -n -U asterisk -G asterisk -C "$work/etc/asterisk.conf" > "$startup_log" 2>&1 &
  asterisk_pid=$!
  ready=false
  attempt=0
  while [ "$attempt" -lt 200 ]; do
    if [ -S "$work/run/asterisk.ctl" ]; then
      /usr/sbin/asterisk -C "$work/etc/asterisk.conf" -rx 'core show version' > "$work/core.out" 2>&1 || true
      if grep -q 'Asterisk' "$work/core.out"; then
        ready=true
        break
      fi
    fi
    if ! kill -0 "$asterisk_pid" 2>/dev/null; then
      break
    fi
    attempt=$((attempt + 1))
    sleep 0.1
  done

  validation_ok=true
  if [ "$ready" != true ]; then
    validation_ok=false
  else
    /usr/sbin/asterisk -C "$work/etc/asterisk.conf" -rx 'dialplan show internal' > "$work/dialplan.out" 2>&1 || validation_ok=false
    /usr/sbin/asterisk -C "$work/etc/asterisk.conf" -rx 'pjsip show endpoints' > "$work/pjsip.out" 2>&1 || validation_ok=false
    grep -q "Context 'internal'" "$work/dialplan.out" || validation_ok=false
    grep -q 'Asterisk' "$work/core.out" || validation_ok=false
  fi

  /usr/sbin/asterisk -C "$work/etc/asterisk.conf" -rx 'core stop now' >/dev/null 2>&1 || true
  wait "$asterisk_pid" 2>/dev/null || true

  if grep -Eiq "ERROR.*(generated|pjsip\.conf|extensions\.conf|queues\.conf|voicemail\.conf|invalid format|cannot be parsed)" "$startup_log"; then
    validation_ok=false
  fi

  if [ "$validation_ok" = true ]; then
    write_result "$deployment_id" ok
  else
    summary="$(sanitize_failure "$startup_log")"
    write_result "$deployment_id" "error ${summary:-Asterisk validation process did not become ready}"
  fi

  rm -rf "$work"
  rm -f "$request"
}

while :; do
  for request in "$PREFLIGHT_ROOT"/*.request; do
    [ -f "$request" ] || continue
    validate_request "$request"
  done
  sleep 0.2
done
