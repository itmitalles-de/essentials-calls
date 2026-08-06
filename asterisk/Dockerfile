# Debian bookworm dropped the "asterisk" package; Ubuntu 22.04 (universe) still ships 18.10.
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    asterisk \
    && rm -rf /var/lib/apt/lists/*

COPY conf-templates/manager.conf /etc/asterisk/manager.conf
COPY conf-templates/pjsip.conf /etc/asterisk/pjsip.conf
COPY conf-templates/extensions.conf /etc/asterisk/extensions.conf
COPY conf-templates/queues.conf /etc/asterisk/queues.conf
COPY conf-templates/voicemail.conf /etc/asterisk/voicemail.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5060/udp 5038 10000-10100/udp

ENTRYPOINT ["/entrypoint.sh"]
