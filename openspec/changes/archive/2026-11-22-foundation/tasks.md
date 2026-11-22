## 1. Монорепозиторий и инструменты

- [x] 1.1 Корневой `package.json` (workspaces `apps/*`, `packages/*`; скрипты dev, build, typecheck, lint, test), `tsconfig.base.json`, ESLint flat config, `.gitignore` (node_modules, dist, .env, data/*.db*, uploads/*), `.env.example`, `data/.gitkeep`
- [x] 1.2 `packages/shared`: пакет `@wt/shared` с Zod-схемами ошибки API и health-ответа, экспорт типов
- [x] 1.3 `AGENTS.md`: команды, структура, правила (из README раздел 12) — кратко

## 2. Backend

- [x] 2.1 `apps/api`: Fastify, `config.ts` (PORT, HOST=0.0.0.0, DB_PATH, CORS_ORIGINS) с Zod-проверкой env, `buildApp()` + `server.ts`
- [x] 2.2 Drizzle-схема всех 4 таблиц по design.md, `drizzle.config.ts`, сгенерированная первая миграция, автоприменение миграций в `buildApp`, PRAGMA foreign_keys/WAL
- [x] 2.3 Плагин ошибок (`AppError`, error/notFound handlers, маппинг ошибок Zod) и подключение `fastify-type-provider-zod`
- [x] 2.4 CORS по списку origin, `GET /api/health` с проверкой БД
- [x] 2.5 [small] Vitest-тесты api: health 200, 404 формат, VALIDATION_ERROR на тестовом маршруте или схеме, данные сохраняются при повторном `buildApp` с тем же файлом

## 3. Frontend

- [x] 3.1 `apps/web`: Vite + React + TS, Tailwind, shadcn/ui базовые компоненты, тёмная тема, `index.html` с viewport/apple-mobile-web-app мета
- [x] 3.2 vite-plugin-pwa: manifest (ru, standalone, theme), иконки (простые сгенерированные PNG 192/512 + apple-touch-icon), SW для оболочки, `/api` — NetworkOnly
- [x] 3.3 Роутинг и layout: нижняя навигация (мобильный) / боковая (десктоп), экраны-заглушки Главная, Тренировки, История, AI-обмен, маршрут активной тренировки
- [x] 3.4 `lib/api.ts` (base URL, ApiError, сетевые ошибки), react-query provider, `ApiErrorState`; на Главной — индикатор health из API

## 4. Проверка

- [x] 4.1 `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` проходят без ошибок
- [x] 4.2 `npm run dev` поднимает оба процесса; `curl http://localhost:3000/api/health` возвращает ok
