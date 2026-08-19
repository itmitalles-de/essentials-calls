FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates sip-tester \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /acceptance
COPY tests/acceptance/ ./

CMD ["node", "full-stack.mjs"]
