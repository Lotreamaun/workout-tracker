## 1. Shared-схемы

- [x] 1.1 `packages/shared/src/exercises.ts`: `exerciseSchema` получает `description: z.string().nullable()`
- [x] 1.2 `packages/shared/src/sessions.ts`: `sessionExerciseSchema` получает `description: z.string().nullable()`

## 2. База данных

- [x] 2.1 Миграция `apps/api/drizzle/0002_exercise_description.sql` и снимок Drizzle: колонка `description text` в таблицы `exercises` и `set_logs`

## 3. API

- [x] 3.1 `apps/api/src/modules/exercises/service.ts`: `ensureExercises` принимает пары название+описание; `toExercises` отдаёт `description`
- [x] 3.2 `apps/api/src/modules/sessions/service.ts`: `startSession` пишет `description` в `set_logs`; `toSession` отдаёт `exercises[].description`
- [x] 3.3 [small] Vitest (API): библиотека сохраняет первое непустое описание, при запуске выбирает самый ранний шаблон; сессия снэпшотит описание и не меняется при правке шаблона

## 4. UI

- [x] 4.1 `apps/web/src/routes/ExercisesPage.tsx`: карточка библиотеки показывает описание под названием (если есть)
- [x] 4.2 `apps/web/src/routes/ExerciseDetailPage.tsx`: описание под названием упражнения
- [x] 4.3 `apps/web/src/features/sessions/ExerciseCard.tsx`: раскрываемое описание под названием во время сессии

## 5. Проверка

- [x] 5.1 `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` проходят

- [x] 5.2 Проверить миграцию на пустой БД, с данными на 0001 и после уже применённой 0002; повторная генерация не создаёт SQL.
- [x] 5.3 Убрать из ветки документы соседних changes.
