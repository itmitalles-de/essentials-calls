# Build context: repo root (needs the shared/ workspace package)
FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS build
WORKDIR /repo
COPY package.json ./
COPY package-lock.json ./
COPY shared/package.json shared/package.json
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN npm ci --no-audit --no-fund --workspace=shared --workspace=frontend --include-workspace-root
COPY shared shared
COPY frontend frontend
RUN npm run build -w shared && npm run build -w frontend

FROM nginx:1.31.3-alpine@sha256:4a73073bd557c65b759505da037898b61f1be6cbcc3c2c3aeac22d2a470c1752
COPY --from=build /repo/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
