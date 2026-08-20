# Asterisk 22 is built from an exact upstream release because Ubuntu 22.04
# only packages the end-of-life Asterisk 18 series. Every downloaded archive
# is version- and checksum-pinned; the runtime image contains no compiler.
ARG UBUNTU_IMAGE=ubuntu:22.04@sha256:2edbbc5dc405e9612ba3584ce95480277e3eb374407b5505fe26f17df77c7dbc

FROM ${UBUNTU_IMAGE} AS builder

ARG ASTERISK_VERSION=22.10.1
ARG ASTERISK_SHA256=0953564c44fa49827f3c9d70ca6e80db83828c9848440852c6be44c961855353
ARG PJPROJECT_VERSION=2.17
ARG PJPROJECT_COMMIT=52e2f32de1b11e40844bb007749a327862f75275
ARG PJPROJECT_SHA256=04b2eb1f0f01aa0ad1945b167171843448a51aa6b7c3e806496d434f13a112b7
ARG JANSSON_VERSION=2.15.0
ARG JANSSON_SHA256=a7eac7765000373165f9373eb748be039c10b2efc00be9af3467ec92357d8954
ARG CORE_SOUNDS_VERSION=1.6.1
ARG CORE_SOUNDS_SHA256=d79c3d2044d41da8f363c447dfccc140be86b4fcc41b1ca5a60a80da52f24f2d

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    autoconf \
    build-essential \
    bzip2 \
    ca-certificates \
    curl \
    libedit-dev \
    libsqlite3-dev \
    libssl-dev \
    libxml2-dev \
    patch \
    pkg-config \
    uuid-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src
RUN curl --fail --location --retry 3 \
      --output asterisk.tar.gz \
      "https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-${ASTERISK_VERSION}.tar.gz" \
    && echo "${ASTERISK_SHA256}  asterisk.tar.gz" | sha256sum --check --strict \
    && mkdir asterisk \
    && tar --extract --gzip --file asterisk.tar.gz --directory asterisk --strip-components=1 \
    && rm asterisk.tar.gz

WORKDIR /usr/src/asterisk
RUN mkdir -p third-party/cache \
    && curl --fail --location --retry 3 \
      --output "third-party/cache/pjproject-${PJPROJECT_VERSION}.tar.bz2" \
      "https://raw.githubusercontent.com/asterisk/third-party/${PJPROJECT_COMMIT}/pjproject/${PJPROJECT_VERSION}/pjproject-${PJPROJECT_VERSION}.tar.bz2" \
    && echo "${PJPROJECT_SHA256}  third-party/cache/pjproject-${PJPROJECT_VERSION}.tar.bz2" \
      | sha256sum --check --strict \
    && curl --fail --location --retry 3 \
      --output "third-party/cache/jansson-${JANSSON_VERSION}.tar.bz2" \
      "https://raw.githubusercontent.com/asterisk/third-party/${PJPROJECT_COMMIT}/jansson/${JANSSON_VERSION}/jansson-${JANSSON_VERSION}.tar.bz2" \
    && echo "${JANSSON_SHA256}  third-party/cache/jansson-${JANSSON_VERSION}.tar.bz2" \
      | sha256sum --check --strict \
    && ./configure \
      --prefix=/usr \
      --sysconfdir=/etc \
      --localstatedir=/var \
      --libdir=/usr/lib/x86_64-linux-gnu \
      --disable-xmldoc \
      --with-download-cache=/usr/src/asterisk/third-party/cache \
      --with-pjproject-bundled \
      --with-jansson-bundled \
    && make menuselect.makeopts \
    && menuselect/menuselect \
      --disable BUILD_NATIVE \
      --disable CORE-SOUNDS-EN-GSM \
      --disable MOH-OPSOUND-WAV \
      menuselect.makeopts \
    && make -j2 \
    && make install DESTDIR=/opt/asterisk-root \
    && make samples DESTDIR=/opt/asterisk-root \
    && install -D -m 0644 COPYING /opt/asterisk-root/usr/share/doc/asterisk/COPYING \
    && install -m 0644 LICENSE /opt/asterisk-root/usr/share/doc/asterisk/LICENSE \
    && install -D -m 0644 third-party/pjproject/source/COPYING \
      /opt/asterisk-root/usr/share/doc/pjproject/COPYING \
    && install -D -m 0644 third-party/jansson/source/LICENSE \
      /opt/asterisk-root/usr/share/doc/jansson/LICENSE

# The runtime base exposes /var/run as a symlink to /run. Asterisk creates its
# volatile control directory at startup, so omit it from the staged root.
RUN rm -rf /opt/asterisk-root/var/run

ARG MOH_VERSION=2.03
ARG MOH_SHA256=449fb810d16502c3052fedf02f7e77b36206ac5a145f3dacf4177843a2fcb538

WORKDIR /usr/src
RUN curl --fail --location --retry 3 \
      --output core-sounds.tar.gz \
      "https://downloads.asterisk.org/pub/telephony/sounds/releases/asterisk-core-sounds-en-gsm-${CORE_SOUNDS_VERSION}.tar.gz" \
    && echo "${CORE_SOUNDS_SHA256}  core-sounds.tar.gz" | sha256sum --check --strict \
    && curl --fail --location --retry 3 \
      --output moh.tar.gz \
      "https://downloads.asterisk.org/pub/telephony/sounds/releases/asterisk-moh-opsound-wav-${MOH_VERSION}.tar.gz" \
    && echo "${MOH_SHA256}  moh.tar.gz" | sha256sum --check --strict \
    && mkdir -p \
      /opt/asterisk-root/usr/share/asterisk/sounds/en_US_f_Allison \
      /opt/asterisk-root/usr/share/asterisk/moh \
      /opt/asterisk-root/usr/share/doc/asterisk-core-sounds-en-gsm \
      /opt/asterisk-root/usr/share/doc/asterisk-moh-opsound-wav \
    && tar --extract --gzip --file core-sounds.tar.gz \
      --directory /opt/asterisk-root/usr/share/asterisk/sounds/en_US_f_Allison \
      --wildcards '*.gsm' \
    && tar --extract --gzip --file core-sounds.tar.gz --directory /tmp \
      "LICENSE-asterisk-core-en-${CORE_SOUNDS_VERSION}" \
      "CREDITS-asterisk-core-en-${CORE_SOUNDS_VERSION}" \
      "CHANGES-asterisk-core-en-${CORE_SOUNDS_VERSION}" \
    && mv /tmp/LICENSE-asterisk-core-en-${CORE_SOUNDS_VERSION} \
      /tmp/CREDITS-asterisk-core-en-${CORE_SOUNDS_VERSION} \
      /tmp/CHANGES-asterisk-core-en-${CORE_SOUNDS_VERSION} \
      /opt/asterisk-root/usr/share/doc/asterisk-core-sounds-en-gsm/ \
    && tar --extract --gzip --file moh.tar.gz \
      --directory /opt/asterisk-root/usr/share/asterisk/moh \
      --wildcards '*.wav' \
    && tar --extract --gzip --file moh.tar.gz --directory /tmp \
      LICENSE-asterisk-moh-opsound-wav \
      CREDITS-asterisk-moh-opsound-wav \
      CHANGES-asterisk-moh-opsound-wav \
    && mv /tmp/LICENSE-asterisk-moh-opsound-wav \
      /tmp/CREDITS-asterisk-moh-opsound-wav \
      /tmp/CHANGES-asterisk-moh-opsound-wav \
      /opt/asterisk-root/usr/share/doc/asterisk-moh-opsound-wav/ \
    && rm core-sounds.tar.gz moh.tar.gz

FROM ${UBUNTU_IMAGE}

ARG ASTERISK_VERSION=22.10.1
LABEL org.opencontainers.image.title="Essentials+ Calls synthetic Asterisk runtime" \
      org.opencontainers.image.version="${ASTERISK_VERSION}" \
      org.opencontainers.image.source="https://github.com/itmitalles-de/essentials-calls"

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    libedit2 \
    libsqlite3-0 \
    libssl3 \
    libtinfo6 \
    libuuid1 \
    libxml2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/asterisk-root/ /

# GID 101 is a persistent compatibility contract used by the backend's
# mode-0640 generated configs and uploaded prompts.
RUN groupadd --system --gid 101 asterisk \
    && useradd --system --uid 101 --gid 101 --home-dir /var/lib/asterisk \
      --no-create-home --shell /usr/sbin/nologin asterisk \
    && rm -rf /var/lib/asterisk/sounds /var/lib/asterisk/moh \
    && mkdir -p \
      /usr/local/share/asterisk/sounds \
      /usr/share/asterisk/keys \
      /usr/share/asterisk/moh \
      /usr/share/asterisk/sounds \
    && ln -s en_US_f_Allison /usr/share/asterisk/sounds/en \
    && ln -s en_US_f_Allison /usr/share/asterisk/sounds/en_US \
    && ln -s ../../../local/share/asterisk/sounds /usr/share/asterisk/sounds/custom \
    && ln -s ../../../usr/share/asterisk/sounds /var/lib/asterisk/sounds \
    && ln -s ../../../usr/share/asterisk/moh /var/lib/asterisk/moh \
    && rm -f /etc/asterisk/extensions.ael /etc/asterisk/stasis.conf /etc/asterisk/users.conf

COPY conf-templates/asterisk.conf /etc/asterisk/asterisk.conf
COPY conf-templates/stasis.conf /etc/asterisk/stasis.conf
COPY conf-templates/manager.conf.template /etc/asterisk/manager.conf.template
COPY conf-templates/modules.conf /etc/asterisk/modules.conf
COPY conf-templates/pjsip.conf /etc/asterisk/pjsip.conf
COPY conf-templates/extensions.conf /etc/asterisk/extensions.conf
COPY conf-templates/queues.conf /etc/asterisk/queues.conf
COPY conf-templates/voicemail.conf /etc/asterisk/voicemail.conf
COPY conf-templates/cdr_manager.conf /etc/asterisk/cdr_manager.conf
COPY entrypoint.sh /entrypoint.sh
COPY preflight-worker.sh /preflight-worker.sh
RUN chmod +x /entrypoint.sh /preflight-worker.sh

EXPOSE 5060/udp 5038 10000-10100/udp

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD asterisk -rx "core waitfullybooted" > /dev/null 2>&1 || exit 1

ENTRYPOINT ["/entrypoint.sh"]
