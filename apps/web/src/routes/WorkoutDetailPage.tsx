import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ApiErrorState } from '@/components/ApiErrorState';
import { WorkoutView } from '@/features/workouts/WorkoutView';
import { useWorkout } from '@/features/workouts/hooks';
import { ApiError } from '@/lib/api';

export function BackToWorkouts() {
  return (
    <Link to="/workouts" className="inline-flex h-11 items-center gap-2 text-sm text-muted-foreground">
      <ArrowLeft className="size-4" aria-hidden /> Тренировки
    </Link>
  );
}

/** Состояния загрузки и ошибки запроса тренировки (общие для просмотра и редактирования). */
export function WorkoutQueryState({ workout }: { workout: ReturnType<typeof useWorkout> }) {
  if (workout.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden /> Загружаем…
      </p>
    );
  }
  if (workout.isError) {
    return workout.error instanceof ApiError && workout.error.status === 404 ? (
      <p role="alert" className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        Тренировка не найдена.
      </p>
    ) : (
      <ApiErrorState error={workout.error} onRetry={() => void workout.refetch()} />
    );
  }
  return null;
}

export function WorkoutDetailPage() {
  const { id } = useParams();
  const workout = useWorkout(id);

  return (
    <section className="space-y-4">
      <BackToWorkouts />
      <h1 className="text-2xl font-bold wrap-anywhere">{workout.data?.name ?? 'Тренировка'}</h1>
      <WorkoutQueryState workout={workout} />
      {workout.isSuccess && <WorkoutView workout={workout.data} />}
    </section>
  );
}
