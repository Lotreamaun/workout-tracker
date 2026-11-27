import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ApiErrorState } from '@/components/ApiErrorState';
import { ExerciseMediaManager } from '@/features/exercises/ExerciseMediaManager';
import { useExercise } from '@/features/exercises/hooks';
import { ApiError } from '@/lib/api';

export function ExerciseDetailPage() {
  const { id } = useParams();
  const exercise = useExercise(id);

  return (
    <section className="space-y-4">
      <Link to="/exercises" className="inline-flex h-11 items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Упражнения
      </Link>
      <h1 className="text-2xl font-bold wrap-anywhere">{exercise.data?.name ?? 'Упражнение'}</h1>
      {exercise.data?.description && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap wrap-anywhere">{exercise.data.description}</p>
      )}

      {exercise.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Загружаем…
        </p>
      )}
      {exercise.isError &&
        (exercise.error instanceof ApiError && exercise.error.status === 404 ? (
          <p role="alert" className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Упражнение не найдено.
          </p>
        ) : (
          <ApiErrorState error={exercise.error} onRetry={() => void exercise.refetch()} />
        ))}
      {exercise.isSuccess && <ExerciseMediaManager exercise={exercise.data} />}
    </section>
  );
}
