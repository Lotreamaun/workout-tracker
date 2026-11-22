import { Archive, Pencil } from 'lucide-react';
import { Link } from 'react-router';
import type { Workout } from '@wt/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StartWorkoutButton } from '@/features/sessions/StartWorkoutButton';
import { formatExercisePlan } from '@/features/sessions/format';

/** Просмотр шаблона тренировки: полный текст без полей ввода. */
export function WorkoutView({ workout }: { workout: Workout }) {
  const archived = workout.archivedAt !== null;

  return (
    <div className="space-y-6">
      {archived && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground"
        >
          <Archive className="mt-0.5 size-4 shrink-0" aria-hidden />
          Тренировка находится в архиве (по ней есть история) и доступна только для просмотра.
        </p>
      )}

      {workout.description && (
        <p className="whitespace-pre-wrap wrap-anywhere text-muted-foreground">{workout.description}</p>
      )}

      {!archived && (
        <div className="space-y-3">
          <StartWorkoutButton workoutId={workout.id} size="lg" className="w-full" />
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link to={`/workouts/${workout.id}/edit`}>
              <Pencil aria-hidden /> Редактировать
            </Link>
          </Button>
        </div>
      )}

      <section aria-labelledby="exercises-heading" className="space-y-3">
        <h2 id="exercises-heading" className="text-lg font-semibold">
          Упражнения
        </h2>

        {workout.exercises.length === 0 && (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Упражнений нет.</p>
        )}

        <ol className="space-y-3">
          {workout.exercises.map((exercise, index) => (
            <li key={exercise.id}>
              <Card className="gap-2 px-5" data-testid="exercise-card">
                <div className="flex items-start gap-3">
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold"
                    aria-hidden
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="font-semibold wrap-anywhere">{exercise.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {formatExercisePlan(
                        exercise.plannedSets,
                        exercise.plannedReps,
                        exercise.plannedWeight,
                        exercise.restSeconds,
                      )}
                    </p>
                  </div>
                </div>
                {exercise.description && (
                  <p className="text-sm whitespace-pre-wrap wrap-anywhere">{exercise.description}</p>
                )}
                {exercise.notes && (
                  <p className="text-sm whitespace-pre-wrap wrap-anywhere text-muted-foreground">{exercise.notes}</p>
                )}
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
