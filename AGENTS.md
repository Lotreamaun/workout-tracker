# AGENTS.md

Персональный трекер тренировок (MVP, один пользователь, без авторизации; API закрыт общим ключом `API_TOKEN`). Источник правды по объёму — `README.md`; спецификации и задачи — `openspec/`. Язык интерфейса — русский.

## Структура

```
apps/web         React + TypeScript + Vite + PWA, Tailwind v4 + shadcn/ui (src/components/ui), react-router, react-query
apps/api         Fastify + SQLite (better-sqlite3) + Drizzle ORM/Kit; модули: src/modules/<name>/{routes,service,repository}.ts
packages/shared  @wt/shared — Zod-схемы и выводимые типы, общие для web и api (экспортируется как TS-исходники)
data/            SQLite-файл и media/ (не коммитятся)
```

## Команды (из корня)

| Команда | Что делает |
|---|---|
| `npm install` | установка зависимостей всех workspaces |
| `npm run dev` | api (http://localhost:3000) + web (http://localhost:5173), оба слушают `0.0.0.0` |
| `npm run typecheck` / `lint` / `test` / `build` | проверки по всему монорепозиторию |
| `npm run db:generate` | сгенерировать миграцию Drizzle Kit из `apps/api/src/db/schema.ts` |
| `npm run db:migrate` | применить миграции вручную (при старте api применяются автоматически) |

Конфигурация — переменные окружения (см. `.env.example`, копировать в `.env`).

## Правила

- Делать блоки по порядку, не расширять scope без явного запроса. После блока запускать typecheck/lint/test/build.
- Любые изменения схемы БД — только миграциями (`db:generate`); не править SQL вручную без причины.
- Вход каждого маршрута (body, params, query) проверять Zod-схемой на сервере; ошибки — в формате `{ error: { code, message, details? } }` (`AppError`, плагин `plugins/errors.ts`).
- UI не обращается к Drizzle/SQLite напрямую — только через API (`apps/web/src/lib/api.ts`).
- Шаблоны тренировок и сессии строго разделены: сессия копирует названия и плановые значения на момент старта.
- Даты — ISO 8601 UTC строками, id — `crypto.randomUUID()`.
- Секреты, `.env`, файлы БД и `data/media/` не коммитить. IndexedDB/оффлайн-данные в MVP не делаем.
- Медиа прикрепляются только к упражнениям библиотеки (`modules/exercises`), сжимаются ffmpeg на сервере; тип файла определять по содержимому, пути файлов строить только из UUID.
- Библиотека упражнений пополняется автоматически по нормализованному названию (`exerciseNameKey`); шаблоны и сессии связываются с ней по названию, без FK.
- Предпочитать простое и обратимое решение; спорные расширения сначала согласовывать.
