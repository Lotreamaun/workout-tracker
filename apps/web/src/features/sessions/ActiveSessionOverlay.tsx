import { Link } from 'react-router';
import type { SessionListItem } from '@wt/shared';
import type { RestTimerApi } from './useRestTimer';
import { formatRemaining } from './restTimer';
import { formatSetsProgress } from './format';
import { Button } from '@/components/ui/button';

interface ActiveSessionOverlayProps {
  session: SessionListItem;
  timer: Pick<RestTimerApi, 'status' | 'remainingMs' | 'durationMs'>;
}

export function ActiveSessionOverlay({ session, timer }: ActiveSessionOverlayProps) {
  const { status, remainingMs, durationMs } = timer;
  const progress = durationMs > 0 ? Math.min(1, remainingMs / durationMs) : 0;

  return (
    <div
      className="mx-2 rounded-t-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur"
      role="region"
      aria-label="Активная тренировка"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-semibold">{session.workoutNameSnapshot}</p>
          <p className="text-xs text-muted-foreground">
            {formatSetsProgress(session.completedSets, session.totalSets)}
          </p>
          {status === 'running' && (
            <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium tabular-nums">
              {formatRemaining(remainingMs)}
              <span className="h-1.5 w-12 overflow-hidden rounded-full bg-background/60">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${progress * 100}%` }}
                />
              </span>
            </span>
          )}
          {status === 'finished' && (
            <span className="inline-flex items-center rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
              Отдых окончен
            </span>
          )}
        </div>
        <Button asChild size="sm" className="h-11 shrink-0">
          <Link to={`/sessions/${session.id}`}>К тренировке</Link>
        </Button>
      </div>
    </div>
  );
}
