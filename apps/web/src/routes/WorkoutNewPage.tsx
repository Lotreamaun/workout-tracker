import { WorkoutEditor } from '@/features/workouts/WorkoutEditor';
import { BackToWorkouts } from '@/routes/WorkoutDetailPage';

export function WorkoutNewPage() {
  return (
    <section className="space-y-4">
      <BackToWorkouts />
      <h1 className="text-2xl font-bold">Новая тренировка</h1>
      <WorkoutEditor />
    </section>
  );
}
