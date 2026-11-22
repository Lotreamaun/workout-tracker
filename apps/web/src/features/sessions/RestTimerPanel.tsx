import { Plus, SkipForward, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatRemaining, REST_ADD_MS } from './restTimer';
import type { RestTimerApi } from './useRestTimer';

interface RestTimerProps {
  timer: RestTimerApi;
  /** Длительность ручного запуска, с. */
  manualSeconds: number;
}

/** Фиксированная панель таймера отдыха над нижней навигацией. */
export function RestTimer({ timer, manualSeconds }: RestTimerProps) {
  const { status, remainingMs, durationMs } = timer;
  const progress = durationMs > 0 ? Math.min(1, remainingMs / durationMs) : 0;

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t bg-card/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60',
        status === 'finished' && 'border-primary bg-primary/15',
      )}
      role="timer"
      aria-label="Таймер отдыха"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        {status === 'idle' && (
          <>
            <Timer className="size-5 text-muted-foreground" aria-hidden />
            <p className="flex-1 text-sm text-muted-foreground">Отдых</p>
            <Button type="button" variant="secondary" onClick={() => timer.start(manualSeconds)}>
              Запустить · {manualSeconds} с
            </Button>
          </>
        )}

        {status === 'running' && (
          <>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-2xl leading-none font-bold tabular-nums" aria-live="off">
                {formatRemaining(remainingMs)}
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
            <Button type="button" variant="secondary" onClick={timer.addTime}>
              <Plus aria-hidden /> {REST_ADD_MS / 1000} с
            </Button>
            <Button type="button" variant="outline" onClick={timer.skip}>
              <SkipForward aria-hidden /> Пропустить
            </Button>
          </>
        )}

        {status === 'finished' && (
          <>
            <p className="flex-1 text-lg font-semibold text-primary" role="status">
              Отдых окончен
            </p>
            <Button type="button" variant="secondary" onClick={timer.addTime}>
              <Plus aria-hidden /> {REST_ADD_MS / 1000} с
            </Button>
            <Button type="button" onClick={timer.skip}>
              Готово
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
