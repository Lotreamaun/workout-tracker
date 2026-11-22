import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ApiErrorState } from '@/components/ApiErrorState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDateTime, formatDuration, formatSetValues, formatSetsProgress } from '@/features/sessions/format';
import { useSession } from '@/features/sessions/hooks';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

export function HistoryDetailPage() {
  const { id } = useParams();
  const query = useSession(id);
  const session = query.data;

  const duration = session ? formatDuration(session.startedAt, session.completedAt) : null;
  const allSets = session?.exercises.flatMap((e) => e.sets) ?? [];

  return (
    <section className="space-y-4">
      <Link to="/history" className="inline-flex h-11 items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" aria-hidden /> История
      </Link>
      <h1 className="text-2xl font-bold">{session?.workoutNameSnapshot ?? 'Занятие'}</h1>

      {query.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Загружаем…
        </p>
      )}
      {query.isError &&
        (query.error instanceof ApiError && query.error.status === 404 ? (
          <p role="alert" className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Занятие не найдено.
          </p>
        ) : (
          <ApiErrorState error={query.error} onRetry={() => void query.refetch()} />
        ))}

      {session && (
        <>
          <p className="text-sm text-muted-foreground">
            {formatDateTime(session.startedAt)}
            {duration && ` · ${duration}`} ·{' '}
            {formatSetsProgress(allSets.filter((s) => s.isCompleted).length, allSets.length)}
            {session.status === 'abandoned' && ' · отменено'}
          </p>

          {session.status === 'in_progress' && (
            <Button asChild>
              <Link to={`/sessions/${session.id}`}>Продолжить тренировку</Link>
            </Button>
          )}

          {session.notes && (
            <Card className="gap-1 px-5">
              <p className="text-sm text-muted-foreground">Заметки к тренировке</p>
              <p className="text-sm whitespace-pre-wrap">{session.notes}</p>
            </Card>
          )}

          {session.exercises.map((exercise) => (
            <Card key={exercise.exercisePosition} className="gap-3 px-5" data-testid="history-exercise">
              <div>
                <h2 className={cn('text-lg font-semibold', exercise.isSkipped && 'text-muted-foreground')}>
                  {exercise.name}
                </h2>
                {exercise.isSkipped && <p className="text-sm text-muted-foreground">Пропущено</p>}
              </div>
              <ul className={cn('divide-y', exercise.isSkipped && 'opacity-60')}>
                {exercise.sets.map((set) => (
                  <li key={set.id} className="space-y-1 py-2 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">Подход {set.setNumber}</span>
                      <span className="text-muted-foreground">
                        план {formatSetValues(set.plannedReps, set.plannedWeight)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={cn('font-semibold', !set.isCompleted && 'text-muted-foreground')}>
                        {set.isCompleted ? 'факт' : 'не выполнен'}
                        {set.isCompleted && ` ${formatSetValues(set.actualReps, set.actualWeight)}`}
                      </span>
                      {set.rpe !== null && <span className="text-muted-foreground">RPE {set.rpe}</span>}
                    </div>
                    {set.notes && <p className="text-muted-foreground">{set.notes}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </>
      )}
    </section>
  );
}
