## 1. Shared-схемы

- [x] 1.1 `packages/shared/src/workouts.ts`: Zod-схемы ввода/вывода по spec (ограничения полей, strict, trim), экспорт типов

## 2. API

- [x] 2.1 `modules/workouts/repository.ts`: запросы списка (с exerciseCount, lastPerformedAt), получения с упражнениями, вставки/обновления/удаления, проверки наличия сессий
- [x] 2.2 `modules/workouts/service.ts`: создание, синхронизация упражнений в транзакции, проверка WORKOUT_ARCHIVED (409), delete vs archive
- [x] 2.3 `modules/workouts/routes.ts` и регистрация в `app.ts`
- [x] 2.4 [small] Vitest-тесты API по сценариям spec: создание, валидация, список без архивных, 404, PATCH (порядок, удаление, чужой id), delete vs archive (сессию для теста вставить напрямую через db)

## 3. UI

- [x] 3.1 Хуки react-query для тренировок
- [x] 3.2 Экран списка «Тренировки» с пустым состоянием
- [x] 3.3 `WorkoutEditor`: поля тренировки, карточки упражнений, ↑/↓, добавление/удаление, сохранение, отображение ошибок сервера
- [x] 3.4 Удаление с подтверждением и сообщением deleted/archived

## 4. Проверка

- [x] 4.1 `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` проходят
