import { ChevronRight, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router';
import { ApiErrorState } from '@/components/ApiErrorState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDateTime, formatSetsProgress, formatTime } from '@/features/sessions/format';
import { useSessions } from '@/features/sessions/hooks';
import { StartWorkoutButton } from '@/features/sessions/StartWorkoutButton';
import { useWorkouts } from '@/features/workouts/hooks';

function Loading({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" aria-hidden /> {children}
    </p>
  );
}

export function HomePage() {
  const active = useSessions('in_progress', 1);
  const workouts = useWorkouts();
  const recent = useSessions('completed', 5);
  const activeSession = active.data?.[0];

  return (
    <section className="space-y-8">
      <h1 className="text-2xl font-bold">Главная</h1>

      {active.isError && <ApiErrorState error={active.error} onRetry={() => void active.refetch()} />}
      {activeSession && (
        <Card className="gap-3 border-primary/60 px-5">
          <div>
            <p className="text-sm text-muted-foreground">Тренировка идёт</p>
            <p className="text-lg font-semibold">{activeSession.workoutNameSnapshot}</p>
            <p className="text-sm text-muted-foreground">
              Начата в {formatTime(activeSession.startedAt)} · {formatSetsProgress(activeSession.completedSets, activeSession.totalSets)}
            </p>
          </div>
          <Button asChild size="lg">
            <Link to={`/sessions/${activeSession.id}`}>Продолжить</Link>
          </Button>
        </Card>
      )}

      <section aria-labelledby="quick-start" className="space-y-3">
        <h2 id="quick-start" className="text-lg font-semibold">
          Быстрый старт
        </h2>
        {workouts.isPending && <Loading>Загружаем тренировки…</Loading>}
        {workouts.isError && <ApiErrorState error={workouts.error} onRetry={() => void workouts.refetch()} />}
        {workouts.isSuccess && workouts.data.length === 0 && (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">Тренировок пока нет. Создайте первую, чтобы начать.</p>
            <Button asChild>
              <Link to="/workouts/new">Создать тренировку</Link>
            </Button>
          </div>
        )}
        {workouts.isSuccess && workouts.data.length > 0 && (
          <ul className="space-y-3">
            {workouts.data.map((workout) => (
              <li key={workout.id}>
                <Card className="gap-3 px-5">
                  <div>
                    <p className="text-lg font-semibold">{workout.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {workout.lastPerformedAt
                        ? `выполнена ${new Date(workout.lastPerformedAt).toLocaleDateString('ru-RU')}`
                        : 'ещё не выполнялась'}
                    </p>
                  </div>
                  <StartWorkoutButton workoutId={workout.id} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="recent" className="text-lg font-semibold">
            Последние занятия
          </h2>
          <Link to="/history" className="text-sm text-muted-foreground">
            Вся история
          </Link>
        </div>
        {recent.isPending && <Loading>Загружаем историю…</Loading>}
        {recent.isError && <ApiErrorState error={recent.error} onRetry={() => void recent.refetch()} />}
        {recent.isSuccess && recent.data.length === 0 && (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Завершённых тренировок пока нет.
          </p>
        )}
        {recent.isSuccess && recent.data.length > 0 && (
          <ul className="space-y-2">
            {recent.data.map((session) => (
              <li key={session.id}>
                <Link
                  to={`/history/${session.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{session.workoutNameSnapshot}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(session.startedAt)} · {formatSetsProgress(session.completedSets, session.totalSets)}
                    </p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
