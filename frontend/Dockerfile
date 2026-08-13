# Build context: repo root (needs the shared/ workspace package)
FROM node:20-alpine AS build
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

FROM nginx:alpine
COPY --from=build /repo/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
