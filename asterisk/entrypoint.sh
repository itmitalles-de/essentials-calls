#!/bin/sh
set -e

AMI_USERNAME="${AMI_USERNAME:-visualpbx}"
AMI_SECRET="${AMI_SECRET:-visualpbx}"

if [ "$AMI_SECRET" = "visualpbx" ]; then
  echo "WARNING: using the default AMI secret. Set AMI_SECRET before exposing this container." >&2
fi

# Render manager.conf from the template so credentials are not baked into the image.
sed -e "s/__AMI_USERNAME__/${AMI_USERNAME}/g" \
    -e "s/__AMI_SECRET__/${AMI_SECRET}/g" \
    /etc/asterisk/manager.conf.template > /etc/asterisk/manager.conf
chmod 640 /etc/asterisk/manager.conf

mkdir -p /etc/asterisk/generated
for f in pjsip_generated.conf extensions_generated.conf queues_generated.conf voicemail_generated.conf; do
  [ -f "/etc/asterisk/generated/$f" ] || : > "/etc/asterisk/generated/$f"
done
chown -R asterisk:asterisk /etc/asterisk/generated /etc/asterisk/manager.conf \
  /var/lib/asterisk /var/log/asterisk /var/spool/asterisk 2>/dev/null || true

exec /usr/sbin/asterisk -f -U asterisk -G asterisk
