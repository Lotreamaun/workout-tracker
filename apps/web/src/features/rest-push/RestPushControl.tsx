import { Bell, BellOff, BellRing, CircleAlert, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RestTimerApi } from '@/features/sessions/useRestTimer';
import type { RestPushApi, RestPushReconnectReason } from './useRestPush';

interface RestPushControlProps {
  restPush: RestPushApi;
  timer: Pick<RestTimerApi, 'endsAt'>;
}

const RECONNECT_TEXT: Record<RestPushReconnectReason, string> = {
  permission: 'Разрешение на уведомления сброшено — подключите их заново.',
  key: 'Сервер уведомлений сменил ключ — подключитесь заново.',
  subscription: 'Подписка устройства устарела — подключите её заново.',
  lost: 'Сервер потерял подписку — подключите её заново.',
};

/** Управление системными уведомлениями об окончании отдыха на экране активной тренировки. */
export function RestPushControl({ restPush, timer }: RestPushControlProps) {
  const { state, reason, message, syncFailed } = restPush;
  if (state === 'checking') return null;

  const shellClass = cn(
    'flex flex-wrap items-start gap-2 rounded-xl border p-3 text-sm [&_button]:min-h-11',
    state === 'unsupported' || state === 'server-off' ? 'border-dashed text-muted-foreground' : null,
    state === 'unreachable' || state === 'error' ? 'border-destructive/60 text-destructive' : null,
    state === 'denied' || state === 'reconnect' ? 'border-primary/40' : null,
  );

  return (
    <section aria-label="Уведомления об отдыхе" className={shellClass}>
      {state === 'unsupported' && (
        <>
          <BellOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="flex-1">
            Уведомления об отдыхе недоступны в этом режиме (нужно установленное на домашний экран приложение с iOS
            16.4 или новее). Таймер работает как обычно.
          </p>
        </>
      )}

      {state === 'server-off' && (
        <>
          <BellOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="flex-1">Сервер уведомлений не настроен. Таймер отдыха работает как обычно.</p>
        </>
      )}

      {state === 'unreachable' && (
        <>
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="flex-1">{message ?? 'Не удалось связаться с сервером уведомлений.'}</p>
          <Button type="button" variant="outline" className="shrink-0" onClick={() => restPush.retry(timer.endsAt)}>
            Повторить
          </Button>
        </>
      )}

      {state === 'off' && (
        <>
          <Bell className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="flex-1">
            Получайте «Отдых окончен» на экране блокировки и в фоне.
          </p>
          <Button type="button" className="shrink-0" onClick={() => restPush.enable(timer.endsAt)}>
            Включить уведомления
          </Button>
        </>
      )}

      {state === 'busy' && (
        <>
          <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
          <p className="flex-1" role="status">
            {restPush.message ?? 'Подключаем уведомления…'}
          </p>
        </>
      )}

      {state === 'on' && (
        <>
          <BellRing className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-primary">Уведомления включены</p>
            {syncFailed ? (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Не удалось обновить таймер на сервере уведомлений. Отсчёт на устройстве продолжается.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Системное уведомление придёт в конце отдыха.</p>
            )}
          </div>
          <Button type="button" variant="outline" className="shrink-0" onClick={restPush.disable}>
            Отключить
          </Button>
        </>
      )}

      {state === 'reconnect' && (
        <>
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="flex-1">{message ?? (reason ? RECONNECT_TEXT[reason] : 'Уведомления требуют повторного подключения.')}</p>
          <Button type="button" className="shrink-0" onClick={() => restPush.enable(timer.endsAt)}>
            Подключить заново
          </Button>
        </>
      )}

      {state === 'denied' && (
        <>
          <BellOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium">Уведомления запрещены</p>
            <p className="text-xs text-muted-foreground">
              Разрешите их для этого приложения в системных настройках (Настройки → Уведомления), затем включите
              снова. Таймер отдыха работает как обычно.
            </p>
          </div>
          <Button type="button" variant="outline" className="shrink-0" onClick={() => restPush.enable(timer.endsAt)}>
            Включить заново
          </Button>
        </>
      )}

      {state === 'error' && (
        <>
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="flex-1" role="alert">
            {message ?? 'Не удалось выполнить операцию.'}
          </p>
          <Button type="button" variant="outline" className="shrink-0" onClick={() => restPush.retry(timer.endsAt)}>
            Повторить
          </Button>
        </>
      )}
    </section>
  );
}
