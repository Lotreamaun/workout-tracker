import { ArrowLeft } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router';
import { WorkoutEditor } from '@/features/workouts/WorkoutEditor';
import { useWorkout } from '@/features/workouts/hooks';
import { WorkoutQueryState } from '@/routes/WorkoutDetailPage';

export function WorkoutEditPage() {
  const { id } = useParams();
  const workout = useWorkout(id);

  // Архивную тренировку редактировать нельзя: возвращаем к просмотру.
  if (workout.isSuccess && workout.data.archivedAt !== null) {
    return <Navigate to={`/workouts/${workout.data.id}`} replace />;
  }

  return (
    <section className="space-y-4">
      <Link to={`/workouts/${id}`} className="inline-flex h-11 items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" aria-hidden /> К просмотру
      </Link>
      <h1 className="text-2xl font-bold">Редактирование</h1>
      <WorkoutQueryState workout={workout} />
      {/* key только по id: при смене updatedAt после сохранения редактор не должен пересоздаваться,
          иначе переход к просмотру из onSuccess теряется вместе со старым экземпляром. */}
      {workout.isSuccess && <WorkoutEditor key={workout.data.id} workout={workout.data} />}
    </section>
  );
}
