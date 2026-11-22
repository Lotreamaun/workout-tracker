# Один контейнер: Fastify раздаёт API и собранный фронтенд, SQLite и медиа лежат в /app/data (volume).
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# Нативные модули (better-sqlite3) для сборки фронтенда не нужны.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build -w @wt/web

# Прод-зависимости: better-sqlite3 собирается из исходников, поэтому нужен компилятор (в итоговый образ он не попадает).
FROM node:24-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev -w @wt/api

FROM node:24-slim AS runtime
# ffmpeg сжимает загружаемые медиа упражнений.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DB_PATH=data/workout-tracker.db \
    MEDIA_DIR=data/media \
    WEB_DIST=apps/web/dist
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY --from=deps /app/node_modules node_modules
COPY packages/shared packages/shared
COPY apps/api/tsconfig.json apps/api/
COPY apps/api/src apps/api/src
COPY apps/api/drizzle apps/api/drizzle
COPY --from=build /app/apps/web/dist apps/web/dist
VOLUME /app/data
EXPOSE 8080
WORKDIR /app/apps/api
CMD ["npx", "tsx", "src/server.ts"]
