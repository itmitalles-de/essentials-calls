#!/bin/sh
set -e

mkdir -p /etc/asterisk/generated
for f in pjsip_generated.conf extensions_generated.conf queues_generated.conf voicemail_generated.conf; do
  [ -f "/etc/asterisk/generated/$f" ] || : > "/etc/asterisk/generated/$f"
done
chown -R asterisk:asterisk /etc/asterisk/generated /var/lib/asterisk /var/log/asterisk /var/spool/asterisk 2>/dev/null || true

exec /usr/sbin/asterisk -f -U asterisk -G asterisk
