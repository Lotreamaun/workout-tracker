## 1. Уведомления (UI)

- [x] 1.1 Компонент Toast и хук useToast: список уведомлений, позиция сверху по центру, авто-dismiss ~6 с, кнопка закрытия, aria-live
- [x] 1.2 Подключение тостов в AppLayout

## 2. Таймер отдыха на overlay

- [x] 2.1 ActiveSessionOverlay показывает оставшееся время отдыха и состояние окончания

## 3. Уведомление об окончании отдыха

- [x] 3.1 Хук useRestTimerNotification: toast при finished, если пользователь не на /sessions/:id
- [x] 3.2 Интеграция хука в overlay; снятие уведомления при новом отдыхе

## 4. Проверка

- [ ] 4.1 npm run typecheck, npm run lint, npm test, npm run build проходят
