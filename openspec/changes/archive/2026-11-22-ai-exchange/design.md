## Context

Схемы тренировок (`workout-builder`) и сессий (`workout-tracker`) уже в `packages/shared`; сервис workouts умеет синхронизировать упражнения. Формат обмена — публичный контракт с ChatGPT, поэтому строгий и версионированный.

## Goals / Non-Goals

**Goals:** переиспользовать валидацию и логику синхронизации; один путь кода для preview и commit; атомарность.

**Non-Goals:** прямой вызов LLM API, diff по полям, миграция формата между версиями, импорт изображений, импорт in_progress/abandoned сессий.

## Decisions

### Один планировщик для preview и commit
`planImport(doc, mode, db)` строит план (`ImportPlan`: список операций create/update с готовыми новыми ID и переписанными ссылками) только чтением БД. Preview возвращает сводку плана; commit строит план и выполняет его в `db.transaction`. Так preview и commit не расходятся.

### Схемы
`ExchangeDocument` в `packages/shared/src/exchange.ts` собирается из `ExerciseInput`-ограничений workout-builder (`.strict()`), `schemaVersion: z.literal(1)`. Проверка версии отдельным шагом до полной схемы, чтобы вернуть `UNSUPPORTED_SCHEMA_VERSION`. Fastify `bodyLimit` 5 МБ на маршрутах импорта.

### Режим replace
Для совпавших по id неархивированных тренировок вызывается существующая `syncWorkoutExercises(tx, workoutId, items, now)` из `apps/api/src/modules/workouts/service.ts`. Она отклоняет чужие id, поэтому планировщик заранее убирает `id` у упражнений, которых нет в этой тренировке (и у повторов), превращая их в создаваемые. Упражнения с чужим или неизвестным id в replace не считаются ошибкой (в отличие от PATCH): они создаются как новые — это ожидаемое поведение для правок от ChatGPT; в `warnings` добавить запись.

### Сессии
Дедупликация по id существующей сессии. Карта `oldWorkoutId → newWorkoutId`, `oldExerciseId → newExerciseId` из плана тренировок; иначе проверка существования в БД; иначе null. Snapshot-поля берутся из документа как есть.

### UI
`/exchange`: секции «Экспорт» и «Импорт». Скачивание — `Blob` + `a[download]` (`workout-tracker-YYYY-MM-DD.json`), копирование — `navigator.clipboard` с fallback выделения текста. Подсказка для ChatGPT — константа в `apps/web/src/features/exchange/chatgptPrompt.ts` (кратко описывает формат v1, требование вернуть только JSON, сохранять id для правок существующих тренировок). Файл читается `file.text()`, `JSON.parse` на клиенте, затем preview. Состояния: ввод → preview → готово; любое изменение текста или режима сбрасывает preview.

## Risks / Trade-offs

- [ChatGPT вернёт JSON с лишними полями или комментариями] → строгая валидация с понятными путями ошибок; подсказка явно просит чистый JSON.
- [replace удаляет упражнения, которых нет в документе] → preview показывает «update», а UI требует отдельного подтверждения.
