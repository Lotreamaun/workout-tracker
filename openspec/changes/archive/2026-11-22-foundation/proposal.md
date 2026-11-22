## Why

Проект пустой: нужен каркас, на который лягут все блоки MVP (Builder, Tracker, AI Exchange). Без единой структуры монорепозитория, схемы БД, валидации и общего формата ошибок каждый следующий блок будет изобретать свои решения.

## What Changes

- Монорепозиторий на npm workspaces: `apps/web`, `apps/api`, `packages/shared`.
- Frontend: React + TypeScript + Vite, PWA (manifest + service worker, кэш оболочки), Tailwind CSS + shadcn/ui, тёмная тема, mobile-first навигация по 5 экранам-заглушкам (Главная, Тренировки, Активная тренировка, История, AI-обмен).
- Backend: Fastify, SQLite (файл в `data/`), Drizzle ORM, миграции Drizzle Kit, Zod-валидация, единый формат ошибок, CORS по списку origin из env, `GET /api/health`.
- Полная схема БД MVP (`workouts`, `workout_exercises`, `workout_sessions`, `set_logs`) и первая миграция, чтобы следующие блоки только писали логику.
- `packages/shared`: общие Zod-схемы и типы (пока — health и формат ошибки).
- Единый запуск `npm run dev` (web + api, слушают `0.0.0.0`), скрипты `typecheck`, `lint`, `test`, `build`; `.env.example`, `.gitignore`, `AGENTS.md`.
- Клиентский API-слой с понятным сообщением, когда backend недоступен.

## Capabilities

### New Capabilities
- `app-foundation`: доступность backend (health-check), единый формат ошибок API, валидация входа, хранение данных между перезапусками, PWA-оболочка и навигация, поведение при недоступном API.

### Modified Capabilities
<!-- нет -->

## Impact

- Новые каталоги: `apps/web`, `apps/api`, `packages/shared`, `data/`.
- Зависимости: react, vite, vite-plugin-pwa, tailwindcss, shadcn/ui (radix), react-router, @tanstack/react-query, fastify, @fastify/cors, better-sqlite3, drizzle-orm, drizzle-kit, zod, vitest, eslint, concurrently/tsx.
