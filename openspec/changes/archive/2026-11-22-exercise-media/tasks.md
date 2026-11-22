## 1. Shared-контракты и БД

- [x] 1.1 `packages/shared/src/exercises.ts`:
  - `exerciseNameKey()`;
  - `MEDIA_LIMITS`;
  - `exerciseMediaSchema`, `exerciseSchema`, `exerciseListSchema`;
  - схемы params (`exerciseIdParamsSchema`, `exerciseMediaParamsSchema`);
  - типы.

  Экспорт из `index.ts`.
- [x] 1.2 Коды ошибок в `ERROR_CODES`: `UNAUTHORIZED`, `MEDIA_LIMIT_REACHED`, `MEDIA_TOO_LARGE`, `MEDIA_UNSUPPORTED`, `MEDIA_PROCESSING_FAILED`.
- [x] 1.3 Добавить `exerciseId: string | null` и `media: ExerciseMedia[]` в `workoutExerciseSchema` и `sessionExerciseSchema` (только ответ; `exerciseInputSchema` не меняется).
- [x] 1.4 Таблицы `exercises` и `exercise_media` в `apps/api/src/db/schema.ts`; `npm run db:generate` → миграция `0001_*`. `image_path` не трогать.

## 2. Доступ по ключу

- [x] 2.1 Конфиг:
  - `API_TOKEN`, `MEDIA_DIR` (по умолчанию `data/media`), `FFMPEG_PATH` (по умолчанию `ffmpeg`) в `config.ts`;
  - проброс в `buildApp`;
  - `.env.example`.
- [x] 2.2 `apps/api/src/plugins/access.ts`: хук `onRequest` (Bearer, `timingSafeEqual` по SHA-256; исключения: не `/api/`, `OPTIONS`, `GET /api/health`). Предупреждение в лог, если ключ не задан.
- [x] 2.3 Web: `lib/accessKey.ts` (хранилище и событие), заголовок `Authorization` в `apiRequest`, событие при 401 `UNAUTHORIZED`. `AccessKeyDialog` в `AppLayout`; после сохранения `invalidateQueries()`.

## 3. Библиотека и медиа (api)

- [x] 3.1 `modules/exercises/repository.ts` и `service.ts`: `ensureExercises`, `resolveExercises`, `listExercises` (сортировка `localeCompare('ru')`), `getExercise`, `deleteExercise`.
- [x] 3.2 Пополнение библиотеки:
  - вызов `ensureExercises` в `syncWorkoutExercises` и в ветке create `exchange/service.ts → executePlan`;
  - backfill в `buildApp` после миграций.
- [x] 3.3 `exerciseId` и `media` через `resolveExercises` в `toWorkout` (workouts) и `toSession` (sessions); проверить, что export не протекает новыми полями.
- [x] 3.4 `modules/exercises/media.ts`:
  - `detectMediaType` по сигнатуре;
  - очередь ffmpeg (concurrency 1, таймаут 180 с, `spawn` без shell);
  - `processImage`, `processVideo`, `makeThumb` по командам из design;
  - очистка `tmp` при старте.
- [x] 3.5 Маршруты:
  - `GET /exercises`, `GET /exercises/:id`, `DELETE /exercises/:id` (204);
  - `POST /exercises/:id/media` (`@fastify/multipart`, лимиты, 201) и `DELETE /exercises/:id/media/:mediaId`;
  - атомарность и откат файлов, повторная проверка лимита в транзакции.
- [x] 3.6 Раздача `/media/` через `@fastify/static` (`files/`, immutable, `maxAge` 365 дней). В `errors.ts` для `/media/` — 404 вместо SPA-fallback.

## 4. Тесты api [small]

- [x] 4.1 [small] Тесты доступа:
  - 401 без ключа и с неверным ключом на GET и POST;
  - 200 с верным ключом;
  - `/api/health` без ключа;
  - без `API_TOKEN` всё открыто.
- [x] 4.2 [small] Тесты библиотеки:
  - пополнение при create, update и импорте;
  - нормализация (« жим  лежа » ≡ «Жим лёжа»);
  - backfill при старте;
  - сортировка;
  - `exerciseId` и `media` в workout и session;
  - удаление упражнения не трогает шаблон.
- [x] 4.3 [small] Тесты медиа (фикстуры генерируются ffmpeg из `lavfi testsrc`; `describe.skipIf`, если ffmpeg нет):
  - GIF → `video`, файлы отдаются, `Content-Type`, Range 206, `Cache-Control`;
  - JPEG 4000×3000 → WebP 1280×960 (проверка через ffprobe);
  - 415 на текст;
  - 413 на файл больше лимита (лимит переопределить в тесте или использовать поток);
  - 409 на шестой файл;
  - удаление медиа → 404 на файлы;
  - `/media/unknown.mp4` → 404;
  - tmp пуст после ошибок.
- [x] 4.4 [small] Юнит-тесты `exerciseNameKey` (shared) и `detectMediaType` (api).

## 5. UI

- [x] 5.1 `lib/api.ts`: `listExercises`, `getExercise`, `deleteExercise`, `uploadExerciseMedia(FormData)`, `deleteExerciseMedia`, `mediaSrc()`. `features/exercises/hooks.ts` (react-query, ключи `['exercises']`).
- [x] 5.2 `MediaViewer`: полноэкранный Radix Dialog, scroll-snap-лента, счётчик, закрытие, стрелки на `md+` и клавиатуре, видео `autoPlay muted loop playsInline`.
- [x] 5.3 `MediaStrip`; встраивание в `WorkoutView` (с кнопкой «Добавить медиа» / «Медиа» → `/exercises/:exerciseId`) и в сессионный `ExerciseCard`.
- [x] 5.4 `ExerciseMediaManager`: сетка, плитка «Добавить», очередь загрузки с плитками «Сжатие…», ранние проверки, ошибки по файлам, удаление с подтверждением, счётчик. Маршрут `/exercises/:id` (`ExerciseDetailPage`) с удалением упражнения.
- [x] 5.5 [small] Маршрут `/exercises` (`ExercisesPage`): поиск, список, пустое состояние. Пункт навигации «Упражнения», `grid-cols-5` на мобильных.
- [x] 5.6 [small] Подсказки названий в `WorkoutEditor` (чипы под полем названия, до 5, по `exerciseNameKey`).
- [x] 5.7 [small] В workbox `navigateFallbackDenylist` добавить `/^\/media\//`.

## 6. Деплой и документация

- [x] 6.1 Dockerfile: `ffmpeg` в runtime-стадии, `ENV MEDIA_DIR=data/media`. `.gitignore`: `data/media/`.
- [x] 6.2 Обновить README (библиотека, медиа, `API_TOKEN`, ffmpeg для локальной разработки), `AGENTS.md` (правило про загрузки и ключ доступа) и `openspec/config.yaml` context (снять «no images» и «no global exercise library»).
- [x] 6.3 Прогнать `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
