# Build context: repo root (needs the shared/ workspace package)
FROM node:20-bookworm-slim AS build
WORKDIR /repo
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json ./
COPY package-lock.json ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --no-audit --no-fund --workspace=shared --workspace=backend --include-workspace-root
COPY shared shared
COPY backend backend
RUN npm run build -w shared && npm run build -w backend

FROM node:20-bookworm-slim
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/shared ./shared
COPY --from=build /repo/backend ./backend
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "backend/dist/index.js"]
