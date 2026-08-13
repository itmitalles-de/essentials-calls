FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates sip-tester \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /acceptance
COPY tests/acceptance/ ./

CMD ["node", "full-stack.mjs"]
