## 1. Shared

- [x] 1.1 `packages/shared/src/exchange.ts`: `ExchangeDocument` v1, тела preview/commit, ответ preview/commit (summary, workouts, warnings)

## 2. API

- [x] 2.1 Переиспользовать `syncWorkoutExercises` из workouts/service.ts внутри транзакции импорта (без изменения поведения PATCH); в replace предварительно снимать неизвестные/повторные id упражнений
- [x] 2.2 `modules/exchange/export`: `GET /api/export` с `includeSessions`
- [x] 2.3 `modules/exchange/plan.ts`: `planImport` (проверка версии, add/replace, новые ID, карта ссылок, дедупликация сессий, warnings)
- [x] 2.4 Маршруты `POST /api/import/preview` и `POST /api/import/commit` (bodyLimit 5 МБ, CONFIRMATION_REQUIRED, транзакция)
- [x] 2.5 [small] Vitest-тесты: round-trip, версия, неизвестные поля, preview без записи, add создаёт новые ID, replace обновляет и требует подтверждения, дедупликация сессий, откат транзакции

## 3. UI

- [x] 3.1 [small] Экран `/exchange`: секция экспорта (переключатель истории, скачать, копировать) и подсказка для ChatGPT
- [x] 3.2 [small] Секция импорта: textarea + выбор файла, режим, «Проверить», preview, подтверждение (двойное для replace), итоговая сводка, отображение ошибок

## 4. Проверка

- [x] 4.1 `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` проходят
