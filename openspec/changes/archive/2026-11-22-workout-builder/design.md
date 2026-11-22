## Context

Схема `workouts`/`workout_exercises` и каркас API (ошибки, Zod type provider, `buildApp`) созданы изменением `foundation`. Отдельных endpoints для упражнений нет (README раздел 5), поэтому упражнения редактируются в составе тренировки.

## Goals / Non-Goals

**Goals:** CRUD шаблонов, предсказуемая синхронизация списка упражнений, мобильно-удобный редактор.

**Non-Goals:** drag-and-drop, изображения, дублирование тренировок, глобальная библиотека упражнений.

## Decisions

### Модуль API
`modules/workouts/{routes.ts, service.ts, repository.ts}`. Repository — только запросы Drizzle; service — правила (синхронизация упражнений, решение delete vs archive, проверка archived); routes — схемы Zod из `@wt/shared` и маппинг в HTTP.

### Синхронизация упражнений (PATCH)
В одной транзакции: загрузить текущие упражнения; проверить, что все переданные `id` принадлежат тренировке; удалить отсутствующие; upsert остальных с `position = index`. Альтернатива — отдельные endpoints на каждое действие — больше запросов и состояний гонки в UI. Удаление упражнения безопасно для истории: `set_logs.workout_exercise_id` ON DELETE SET NULL, snapshot-поля сохраняются.

### Схемы в shared
`WorkoutCreateInput`, `WorkoutUpdateInput`, `ExerciseInput` (с опциональным `id` для update), `Workout`, `WorkoutExercise`, `WorkoutListItem`, `DeleteWorkoutResult`. Строгие объекты (`.strict()`), строки — `.trim()`. Nullable-поля в ответах — `null`, не `undefined`. Эти схемы переиспользует AI Exchange.

### lastPerformedAt
Подзапрос `max(completed_at)` по `workout_sessions` со статусом `completed`. Пока сессий нет — всегда null; блок Tracker начнёт заполнять.

### UI
- `/workouts` — список карточек; `/workouts/new` и `/workouts/:id` — один компонент `WorkoutEditor` с локальным состоянием формы (react-hook-form не обязателен; простой `useState`/`useReducer` допустим) и одним сохранением.
- Числовые поля `inputMode="numeric"`/`"decimal"`, крупные зоны нажатия (≥44px).
- Порядок — кнопки ↑/↓; новые упражнения добавляются в конец с `plannedSets: 3`.
- Удаление: shadcn `AlertDialog`; после ответа показывать «Удалено» или «Перенесено в архив (есть история)».
- Хуки `useWorkouts`, `useWorkout(id)`, `useSaveWorkout`, `useDeleteWorkout` в `apps/web/src/features/workouts/`.

## Risks / Trade-offs

- [Полная замена списка при PATCH: клиент со старыми данными может удалить упражнения] → однопользовательское приложение; принимаем.
- [Вес только в кг] → единицы не настраиваются в MVP.
