## Why

Описание упражнения в шаблоне хранится в `workout_exercises.description` и показывается только на экране просмотра тренировки (`WorkoutView`, раздел «Тренировки»). Пользователь не видит описание: (а) во время выполнения сессии — в карточке упражнения `ExerciseCard`, (б) в библиотеке «Упражнения» — в карточке упражнения. Нужно сделать описание доступным в обоих местах, сохранив разделение шаблона и сессии (снэпшот сессии не меняется при правке шаблона).

## What Changes

- `packages/shared`: `Exercise.description` и `SessionExercise.description` добавляются в Zod-схемы и выводимые типы.
- БД: новая миграция добавляет колонку `description text` в таблицы `exercises` (библиотека) и `set_logs` (снэпшот упражнения сессии).
- API exercises: `ensureExercises` принимает пары название+описание (имя берётся из первого появления, описание — первое непустое); `toExercises` отдаёт `description` в `GET /api/exercises` и `GET /api/exercises/:id`.
- При старте API пустые описания библиотеки заполняются из существующих шаблонов по дате создания шаблона. Уже записанные описания сохраняются.
- API sessions: `startSession` пишет `exercise.description` в `set_logs.description` при старте; `toSession` отдаёт `exercises[].description`. Редактирование шаблона не меняет снэпшоты существующих сессий.
- UI: карточка библиотеки на `/exercises`, `ExerciseDetailPage` показывают описание под названием. Во время сессии описание открывается по кнопке «Описание упражнения».

## Capabilities

Новые: нет.
Изменённые: `exercise-library` (библиотека упражнений хранит описание), `workout-sessions` (снэпшот сессии включает описание упражнения).

## Impact

`packages/shared/src/exercises.ts`, `packages/shared/src/sessions.ts`, `apps/api/drizzle/` (новая миграция), `apps/api/src/modules/exercises/service.ts`, `apps/api/src/modules/sessions/service.ts`, `apps/web/src/routes/ExercisesPage.tsx`, `apps/web/src/routes/ExerciseDetailPage.tsx`, `apps/web/src/features/sessions/ExerciseCard.tsx`.
