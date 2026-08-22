FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

ARG DEBIAN_ARCHIVE_SNAPSHOT=20260820T142943Z
ARG DEBIAN_SECURITY_SNAPSHOT=20260820T142410Z
RUN sed -i \
      -e "s|^URIs: http://deb.debian.org/debian$|URIs: http://snapshot.debian.org/archive/debian/${DEBIAN_ARCHIVE_SNAPSHOT}|" \
      -e "s|^URIs: http://deb.debian.org/debian-security$|URIs: http://snapshot.debian.org/archive/debian-security/${DEBIAN_SECURITY_SNAPSHOT}|" \
      /etc/apt/sources.list.d/debian.sources \
    && ! grep -q '^URIs: http://deb.debian.org/' /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::Check-Valid-Until=false \
      -o APT::Update::Error-Mode=any update \
    && apt-get install -y --no-install-recommends \
      ca-certificates=20250419~deb12u1 \
      sip-tester=1:3.6.1-1+b2 \
    && rm -rf /var/lib/apt/lists/*

RUN rm -rf \
      /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack \
      /opt/yarn-v1.22.22 \
    && rm -f \
      /usr/local/bin/npm \
      /usr/local/bin/npx \
      /usr/local/bin/corepack \
      /usr/local/bin/yarn \
      /usr/local/bin/yarnpkg

WORKDIR /acceptance
COPY tests/acceptance/ ./

CMD ["node", "full-stack.mjs"]
