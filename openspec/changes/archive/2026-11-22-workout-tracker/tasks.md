## 1. Shared-схемы

- [x] 1.1 `packages/shared/src/sessions.ts`: схемы деталей сессии, элемента списка, query списка, PATCH-тела (ограничения RPE/reps/weight), complete-тела

## 2. API

- [x] 2.1 `modules/sessions/repository.ts`: вставка сессии и подходов, чтение деталей с группировкой, список с completedSets/totalSets, обновления
- [x] 2.2 `modules/sessions/service.ts`: запуск со snapshot (проверки SESSION_IN_PROGRESS, WORKOUT_ARCHIVED, WORKOUT_EMPTY), PATCH (принадлежность подходов, completedAt, skip, abandon, SESSION_NOT_EDITABLE), complete (SESSION_NOT_IN_PROGRESS)
- [x] 2.3 Маршруты `POST /api/workouts/:id/sessions`, `GET /api/sessions`, `GET/PATCH /api/sessions/:id`, `POST /api/sessions/:id/complete`
- [x] 2.4 [small] Vitest-тесты API по сценариям обеих spec, включая независимость истории от изменения/архивирования шаблона и `lastPerformedAt`

## 3. UI

- [x] 3.1 Хуки react-query для сессий с оптимистичным обновлением
- [x] 3.2 Экран активной тренировки: карточки упражнений, строки подходов (план vs факт, ввод, отметка с подстановкой плана), пропуск, заметки, завершить/отменить с подтверждением
- [x] 3.3 `getRemainingMs`, `useRestTimer`, компонент `RestTimer` (+15 с, пропустить, ручной запуск, localStorage, visibilitychange, vibrate)
- [x] 3.4 [small] Vitest-тесты для `getRemainingMs` и логики таймера (fake timers) в apps/web
- [x] 3.5 Главная: активная сессия «Продолжить», быстрый запуск (обработка 409 → переход к активной), последние 5 занятий
- [x] 3.6 История: список и детальный просмотр

## 4. Проверка

- [x] 4.1 `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` проходят
