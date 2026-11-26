## Why

Таймер отдыха работает только на экране сессии. При уходе на другую вкладку пользователь не видит остаток отдыха и не узнаёт, когда отдых окончен. Нужно видеть таймер отдыха с любого экрана и получать in-app уведомление по окончании отдыха.

## What Changes

- `ActiveSessionOverlay` показывает оставшееся время отдыха (useRestTimerNotification) и состояние «Отдых окончен».
- Система in-app уведомлений (toast): компонент ToastContainer и хук useToast, подключённые в AppLayout (позиция сверху по центру, авто-скрытие ~6 с, кнопка закрытия, aria-live).
- Хук useRestTimerNotification: при истечении отдыха показывает уведомление «Отдых окончен» с кнопкой «К тренировке», только если пользователь не на экране сессии.

## Capabilities

Новые: `rest-notifications` — in-app уведомление об окончании отдыха с любого экрана.

## Impact

`apps/web/src/lib/use-toast.ts`, `apps/web/src/components/ui/toast.tsx`, `apps/web/src/components/AppLayout.tsx`, `apps/web/src/features/sessions/ActiveSessionOverlay.tsx`, `apps/web/src/features/sessions/useRestTimerNotification.ts`.
