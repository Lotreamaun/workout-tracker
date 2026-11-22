## Context

Пустая папка, не git-репозиторий. Стек и структура зафиксированы в README.md (разделы 1, 2, 9). Этот блок закладывает основу, на которой Builder, Tracker и AI Exchange только добавляют модули.

## Goals / Non-Goals

**Goals:**
- Один `npm install` + `npm run dev` поднимает web (Vite, порт 5173) и api (Fastify, порт 3000) на `0.0.0.0`.
- Полная схема БД MVP и первая миграция уже в этом блоке.
- Повторяемые соглашения: модуль API = `routes.ts` + `service.ts` + `repository.ts`; общие Zod-схемы в `packages/shared`.

**Non-Goals:**
- Бизнес-логика тренировок/сессий/импорта (следующие изменения).
- Загрузка изображений (`imagePath` только как nullable-колонка).
- HTTPS, деплой, Docker.

## Decisions

### Структура
```
apps/api/src/{app.ts, server.ts, config.ts, db/{schema.ts, client.ts, migrate.ts}, plugins/errors.ts, modules/health/}
apps/api/drizzle/            # SQL-миграции drizzle-kit
apps/web/src/{main.tsx, App.tsx, routes/, components/ui/ (shadcn), components/, lib/api.ts}
packages/shared/src/{index.ts, errors.ts, health.ts}
```
`app.ts` экспортирует `buildApp({ dbPath })` — фабрику без `listen`, чтобы тесты использовали `app.inject()` с временным файлом БД. `server.ts` читает config и слушает.

### SQLite: better-sqlite3 + drizzle-orm/better-sqlite3
Синхронный драйвер, простые транзакции (`db.transaction`), понадобятся для импорта. Включить `PRAGMA foreign_keys = ON` и `journal_mode = WAL`. Альтернатива libsql — лишняя сложность для одного файла.

### Миграции
`drizzle-kit generate` генерирует SQL в `apps/api/drizzle/`; `migrate()` из `drizzle-orm/better-sqlite3/migrator` вызывается в `buildApp` при старте. Скрипты: `db:generate`, `db:migrate`.

### Схема (все таблицы сразу)
- `workouts`: id (text PK, UUID), name, description?, archived_at?, created_at, updated_at.
- `workout_exercises`: id, workout_id FK→workouts ON DELETE CASCADE, name, description?, position (int), planned_sets (int), planned_reps?, planned_weight? (real), rest_seconds?, notes?, image_path?, created_at, updated_at. Индекс (workout_id, position).
- `workout_sessions`: id, workout_id FK→workouts (nullable, ON DELETE SET NULL), workout_name_snapshot, status (`in_progress|completed|abandoned`), started_at, completed_at?, notes?. Индексы workout_id, started_at.
- `set_logs`: id, session_id FK→workout_sessions ON DELETE CASCADE, workout_exercise_id (nullable, ON DELETE SET NULL), exercise_name_snapshot, exercise_position (int), set_number, planned_reps?, actual_reps?, planned_weight?, actual_weight?, rest_seconds?, rpe? (real), is_completed (bool), is_skipped (bool), completed_at?, notes?. Индекс session_id.
- Даты — TEXT ISO 8601 UTC, генерируются в приложении. ID — `crypto.randomUUID()`.
Snapshot-поля в `set_logs` (имя, позиция, плановые значения, отдых) делают историю независимой от шаблона; `is_skipped` нужен для «пропустить упражнение».

### Ошибки и валидация
Плагин `errors.ts`: `setErrorHandler` + `setNotFoundHandler`, класс `AppError(code, status, message, details?)`. Валидация через `fastify-type-provider-zod` (validatorCompiler/serializerCompiler), ошибки валидации маппятся в `VALIDATION_ERROR`. Формат ошибки описан Zod-схемой в shared.

### Frontend
- react-router (BrowserRouter): `/`, `/workouts`, `/workouts/:id`, `/sessions/:id` (активная тренировка), `/history`, `/history/:id`, `/exchange`.
- @tanstack/react-query для запросов; `lib/api.ts` — fetch-обёртка с `VITE_API_URL` (по умолчанию `http://<location.hostname>:3000`, чтобы iPhone в LAN работал без правок), разбором формата ошибки и классом `ApiError`; сетевую ошибку отличать (`kind: 'network'`).
- Компонент `ApiErrorState` («Сервер недоступен» + «Повторить»).
- Tailwind v4 + shadcn/ui (Button, Input, Card, Dialog, Textarea, Label и т.п. по мере надобности), класс `dark` на `<html>` постоянно.
- vite-plugin-pwa (`registerType: 'autoUpdate'`, generateSW; runtime caching для `/api` — NetworkOnly).

### Инструменты
TypeScript strict, ESLint (flat config, typescript-eslint, react-hooks), Vitest в api и shared (web — пока без тестов, допускается `--passWithNoTests`). Корневые скрипты делегируют в workspaces (`npm run <x> --workspaces --if-present`). `dev` через `concurrently`; api в dev через `tsx watch`. Shared собирать не нужно: экспорт исходников TS через `exports` + paths, либо `tsc -b` — выбрать самый простой работающий вариант для Vite и tsx.

## Risks / Trade-offs

- [better-sqlite3 — нативный модуль, Node 26] → если prebuild нет, собирается из исходников; при проблемах зафиксировать рабочую версию.
- [CORS + LAN-адрес iPhone] → в `.env.example` пример `CORS_ORIGINS=http://localhost:5173,http://192.168.1.10:5173`; в dev допускается флаг разрешить любые private-network origin.
- [Service worker кэширует старую оболочку] → autoUpdate; SW регистрируется только в production-сборке.
