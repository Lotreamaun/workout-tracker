# data-exchange Specification

## Purpose
Ручной обмен данными с ChatGPT через версионированный JSON: экспорт плана и истории, проверка и безопасный подтверждённый импорт без незаметной перезаписи.
## Requirements
### Requirement: Формат обмена v1
Документ обмена SHALL иметь вид `{ schemaVersion: 1, exportedAt?: ISO string, workouts: ExchangeWorkout[], sessions?: ExchangeSession[] }`. `ExchangeWorkout` = `{ id?, name, description?, exercises: [{ id?, name, description?, plannedSets, plannedReps?, plannedWeight?, restSeconds?, notes? }] }` с теми же ограничениями полей, что и в workout-builder. `ExchangeSession` = `{ id?, workoutId?, workoutNameSnapshot, status: "completed", startedAt, completedAt, notes?, exercises: [{ workoutExerciseId?, exercisePosition, name, restSeconds?, isSkipped, sets: [{ setNumber, plannedReps?, actualReps?, plannedWeight?, actualWeight?, rpe?, isCompleted, completedAt?, notes? }] }] }`. `schemaVersion` MUST быть обязательным; другая версия или отсутствие MUST отклоняться. Лимиты: не более 200 тренировок, 2000 сессий, тело запроса до 5 МБ.

#### Scenario: Отсутствует schemaVersion
- **WHEN** импортируется JSON без `schemaVersion`
- **THEN** ответ 400 `VALIDATION_ERROR` с указанием поля

#### Scenario: Неподдерживаемая версия
- **WHEN** `schemaVersion` равен 2
- **THEN** ответ 400 `UNSUPPORTED_SCHEMA_VERSION`

### Requirement: Экспорт
`GET /api/export?includeSessions=true|false` (по умолчанию `true`) SHALL возвращать документ формата v1 с `exportedAt`, всеми неархивированными шаблонами с упражнениями по порядку (с их id) и, если включено, всеми завершёнными сессиями с подходами. Экспорт MUST проходить схему импорта (round-trip).

#### Scenario: Round-trip
- **WHEN** результат экспорта передаётся в `POST /api/import/preview`
- **THEN** документ валиден

#### Scenario: Без истории
- **WHEN** вызывается `GET /api/export?includeSessions=false`
- **THEN** поле `sessions` пустое или отсутствует

### Requirement: Предварительный просмотр импорта
`POST /api/import/preview` с телом `{ mode: "add" | "replace", data: <документ> }` SHALL полностью проверять документ и возвращать сводку без записи в БД: `{ mode, workouts: [{ name, action: "create" | "update", exerciseCount }], summary: { workoutsToCreate, workoutsToUpdate, exercisesToCreate, sessionsToCreate, sessionsToSkip, setsToCreate }, warnings: string[] }`. Ошибки структуры MUST возвращаться как 400 `VALIDATION_ERROR` с путями полей в `details`.

#### Scenario: Preview не пишет в БД
- **WHEN** вызывается preview валидного документа
- **THEN** количество тренировок и сессий в БД не меняется

### Requirement: Режим add
В режиме `add` каждая тренировка документа SHALL создаваться как новая с новыми ID, независимо от наличия `id` в документе. Существующие данные MUST NOT изменяться.

#### Scenario: Повторный импорт того же плана
- **WHEN** документ с тренировкой, id которой уже есть в БД, импортируется в режиме `add`
- **THEN** создаётся новая тренировка с новым id, исходная не изменена

### Requirement: Режим replace
В режиме `replace` тренировка документа, чей `id` совпадает с неархивированной тренировкой в БД, SHALL обновлять её название, описание и список упражнений по правилам PATCH из workout-builder (упражнения с совпадающим id этой тренировки обновляются, без совпадения — создаются с новым id, отсутствующие — удаляются). Тренировки без совпадения создаются как новые. Commit в режиме `replace` MUST требовать `confirmReplace: true`, иначе 400 `CONFIRMATION_REQUIRED`. История сессий MUST NOT изменяться.

#### Scenario: Обновление плана от ChatGPT
- **WHEN** экспортированная тренировка изменена (новый вес, добавлено упражнение) и импортирована с `mode: "replace"`, `confirmReplace: true`
- **THEN** тренировка с тем же id обновлена, добавленное упражнение создано, прошлые сессии не изменились

#### Scenario: Без подтверждения
- **WHEN** commit в режиме `replace` без `confirmReplace: true`
- **THEN** ответ 400 `CONFIRMATION_REQUIRED`, данные не меняются

### Requirement: Импорт сессий
Сессии документа SHALL создаваться как новые записи с новыми ID. Сессия, чей `id` уже существует в БД, MUST пропускаться (учитывается в `sessionsToSkip`). `workoutId` сессии MUST переписываться на id тренировки, созданной/обновлённой из того же документа, иначе сохраняться, если такая тренировка есть в БД, иначе становиться null; аналогично `workoutExerciseId`. Ссылки, не прошедшие проверку, MUST NOT вызывать ошибку внешнего ключа.

#### Scenario: Повторный импорт истории
- **WHEN** экспорт с историей импортируется обратно в той же БД
- **THEN** все сессии пропускаются как уже существующие, дубликаты не создаются

### Requirement: Транзакционный commit
`POST /api/import/commit` с телом `{ mode, data, confirmReplace? }` SHALL повторно проверять документ и записывать всё в одной транзакции: при любой ошибке MUST NOT сохраняться ничего. Ответ 200 со сводкой фактически выполненных действий в том же формате `summary`.

#### Scenario: Ошибка посреди импорта
- **WHEN** запись одной из сущностей завершается ошибкой
- **THEN** ответ — ошибка, ни одна тренировка или сессия из документа не сохранена

### Requirement: Безопасность импорта
Импорт MUST NOT исполнять содержимое JSON, принимать пути к файлам или поля, отсутствующие в схеме (неизвестные поля отклоняются), и MUST NOT доверять внешним ID без проверки принадлежности.

#### Scenario: Посторонние поля
- **WHEN** документ содержит поле `imagePath` или неизвестное поле
- **THEN** ответ 400 `VALIDATION_ERROR`

### Requirement: Экран AI-обмена
Экран «AI-обмен» SHALL позволять: экспортировать JSON (скачать файл и скопировать в буфер, переключатель «включить историю»); скопировать готовую подсказку для ChatGPT с описанием формата v1; импортировать через вставку текста или выбор `.json`-файла (читается на клиенте); выбрать режим (по умолчанию «Добавить как новые»); нажать «Проверить» и увидеть preview со списком тренировок, действиями и сводкой; подтвердить импорт (для режима замены — отдельное явное подтверждение). Невалидный JSON или ошибки схемы MUST показываться понятным списком.

#### Scenario: Невалидный текст
- **WHEN** пользователь вставляет текст, не являющийся JSON, и нажимает «Проверить»
- **THEN** отображается сообщение «Некорректный JSON», запрос импорта не выполняется

#### Scenario: Успешный импорт
- **WHEN** пользователь проверил документ и подтвердил импорт
- **THEN** отображается итоговая сводка, новые тренировки видны в разделе «Тренировки»

