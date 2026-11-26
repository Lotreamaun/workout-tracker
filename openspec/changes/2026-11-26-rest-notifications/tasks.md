## 1. Уведомления (UI)

- [ ] 1.1 Компонент `Toast` и хук `useToast`: список уведомлений, позиция сверху по центру, авто-dismiss ≈ 6 с, кнопка закрытия, aria-live [small]
- [ ] 1.2 Подключение тостов в `AppLayout`

## 2. Таймер отдыха на overlay

- [ ] 2.1 `ActiveSessionOverlay` показывает оставшееся время отдыха (`useRestTimer`) и состояние окончания

## 3. Уведомление об окончании отдыха

- [ ] 3.1 Хук `useRestTimerNotification(sessionId)`: toast при `finished`, если пользователь не на `/sessions/:id`
- [ ] 3.2 Интеграция хука в overlay/AppLayout; снятие уведомления при новом отдыхе/возврате на сессию

## 4. Проверка

- [ ] 4.1 `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` проходят
- [ ] 4.2 [small] Ручная проверка: отдых на другом экране → toast; возврат на экран сессии → без дубля тоста
