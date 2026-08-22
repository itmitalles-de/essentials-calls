# Build context: repo root (needs the shared/ workspace package)
FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS build
WORKDIR /repo
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
      python3=3.11.2-1+b1 \
      make=4.3-4.1 \
      g++=4:12.2.0-3 \
    && rm -rf /var/lib/apt/lists/*
COPY package.json ./
COPY package-lock.json ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --no-audit --no-fund --workspace=shared --workspace=backend --include-workspace-root
COPY shared shared
COPY backend backend
RUN npm run build -w shared \
    && npm run build -w backend \
    && npm prune --omit=dev --no-audit --no-fund \
      --workspace=shared --workspace=backend --include-workspace-root

FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03
WORKDIR /repo
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
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/shared ./shared
COPY --from=build /repo/backend ./backend
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "backend/dist/index.js"]
