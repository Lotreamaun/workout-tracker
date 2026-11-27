import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import type { RestTimerStatus } from './useRestTimer';

const AUTO_DISMISS_MS = 6000;

interface RestTimerNotificationProps {
  sessionId: string;
  workoutName: string;
  status: RestTimerStatus;
  onSessionPage: boolean;
}

export function RestTimerNotification({ sessionId, workoutName, status, onSessionPage }: RestTimerNotificationProps) {
  const [notification, setNotification] = useState({ status, onSessionPage, visible: false });

  if (notification.status !== status || notification.onSessionPage !== onSessionPage) {
    setNotification({
      status,
      onSessionPage,
      visible: status === 'finished' && !onSessionPage && notification.status === 'running',
    });
  }

  const { visible } = notification;
  useEffect(() => {
    if (!visible) return;
    const timeout = setTimeout(() => {
      setNotification((previous) => ({ ...previous, visible: false }));
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timeout);
  }, [visible]);

  function dismiss() {
    setNotification((previous) => ({ ...previous, visible: false }));
  }

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {visible && 'Отдых окончен'}
      </div>
      {visible && (
        <div
          role="group"
          aria-label="Уведомление об отдыхе"
          className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 mx-auto flex max-w-sm items-center gap-2 rounded-xl border bg-card p-2 pl-3 text-card-foreground shadow-lg"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Отдых окончен</p>
            <p className="truncate text-xs text-muted-foreground">{workoutName}</p>
          </div>
          <Button asChild size="sm" className="h-11 shrink-0">
            <Link to={`/sessions/${sessionId}`} onClick={dismiss}>К тренировке</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            aria-label="Закрыть уведомление"
            onClick={dismiss}
          >
            <X aria-hidden />
          </Button>
        </div>
      )}
    </>
  );
}
