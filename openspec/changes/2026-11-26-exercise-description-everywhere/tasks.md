## 1. Shared-схемы

- [ ] 1.1 `packages/shared/src/exercises.ts`: `exerciseSchema` получает `description: z.string().nullable()`
- [ ] 1.2 `packages/shared/src/sessions.ts`: `sessionExerciseSchema` получает `description: z.string().nullable()`

## 2. База данных

- [ ] 2.1 Миграция `apps/api/drizzle/0002_exercise_description.sql`: колонка `description text` в таблицы `exercises` и `set_logs`

## 3. API

- [ ] 3.1 `apps/api/src/modules/exercises/service.ts`: `ensureExercises` принимает пары название+описание; `toExercises` отдаёт `description`
- [ ] 3.2 `apps/api/src/modules/sessions/service.ts`: `startSession` пишет `description` в `set_logs`; `toSession` отдаёт `exercises[].description`
- [ ] 3.3 [small] Vitest (API): библиотека возвращает описание (первое появление побеждает); сессия снэпшотит описание и не меняется при правке шаблона

## 4. UI

- [ ] 4.1 `apps/web/src/routes/ExercisesPage.tsx`: карточка библиотеки показывает описание под названием (если есть)
- [ ] 4.2 `apps/web/src/routes/ExerciseDetailPage.tsx`: описание под названием упражнения
- [ ] 4.3 `apps/web/src/features/sessions/ExerciseCard.tsx`: описание под названием во время сессии

## 5. Проверка

- [ ] 5.1 `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` проходят
