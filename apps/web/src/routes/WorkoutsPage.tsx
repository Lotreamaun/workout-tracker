import { LoaderCircle, Plus } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { ApiErrorState } from '@/components/ApiErrorState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { WorkoutsPageState } from '@/features/workouts/DeleteWorkoutButton';
import { useWorkouts } from '@/features/workouts/hooks';

function pluralExercises(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} упражнений`;
  if (mod10 === 1) return `${count} упражнение`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} упражнения`;
  return `${count} упражнений`;
}

export function WorkoutsPage() {
  const workouts = useWorkouts();
  const notice = (useLocation().state as WorkoutsPageState | null)?.notice;

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Тренировки</h1>
        {workouts.isSuccess && workouts.data.length > 0 && (
          <Button asChild>
            <Link to="/workouts/new">
              <Plus aria-hidden /> Создать
            </Link>
          </Button>
        )}
      </header>

      {notice && (
        <p role="status" className="rounded-xl border bg-card p-4 text-sm">
          {notice}
        </p>
      )}

      {workouts.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Загружаем тренировки…
        </p>
      )}
      {workouts.isError && <ApiErrorState error={workouts.error} onRetry={() => void workouts.refetch()} />}

      {workouts.isSuccess && workouts.data.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-8 text-center">
          <p className="text-muted-foreground">Тренировок пока нет. Создайте первую, чтобы начать.</p>
          <Button asChild size="lg">
            <Link to="/workouts/new">Создать тренировку</Link>
          </Button>
        </div>
      )}

      {workouts.isSuccess && workouts.data.length > 0 && (
        <ul className="space-y-3">
          {workouts.data.map((workout) => (
            <li key={workout.id}>
              <Link
                to={`/workouts/${workout.id}`}
                className="block rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Card className="gap-1 px-5 transition-colors hover:bg-accent">
                  <p className="text-lg font-semibold">{workout.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {pluralExercises(workout.exerciseCount)} ·{' '}
                    {workout.lastPerformedAt
                      ? `выполнена ${new Date(workout.lastPerformedAt).toLocaleDateString('ru-RU')}`
                      : 'ещё не выполнялась'}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
