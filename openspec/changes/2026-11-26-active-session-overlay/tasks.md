## 1. UI

- [x] 1.1 [small] `apps/web/src/features/sessions/ActiveSessionOverlay.tsx`: мини-плеер активной сессии (название, прогресс подходов, таймер отдыха, кнопка «К тренировке»), видимость только при активной сессии и не на `/sessions/:id`, только mobile.
- [x] 1.2 `apps/web/src/components/AppLayout.tsx`: подключить `<ActiveSessionOverlay />` вне `<Routes>`, перед `<AccessKeyDialog />`.

## 2. Проверка

- [x] 2.1 `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` проходят.