import { useState } from 'react';
import { ChevronRight, ImageOff, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router';
import { exerciseNameKey } from '@wt/shared';
import { ApiErrorState } from '@/components/ApiErrorState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MediaThumb } from '@/features/exercises/MediaThumb';
import { useExercises } from '@/features/exercises/hooks';

export function ExercisesPage() {
  const exercises = useExercises();
  const [query, setQuery] = useState('');

  const visible = exercises.data?.filter((exercise) =>
    exerciseNameKey(exercise.name).includes(exerciseNameKey(query)),
  );

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Упражнения</h1>

      {exercises.isSuccess && exercises.data.length > 0 && (
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск упражнения"
          aria-label="Поиск упражнения"
        />
      )}

      {exercises.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Загружаем упражнения…
        </p>
      )}
      {exercises.isError && <ApiErrorState error={exercises.error} onRetry={() => void exercises.refetch()} />}

      {exercises.isSuccess && exercises.data.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-8 text-center">
          <p className="text-muted-foreground">Упражнения появятся здесь, когда вы добавите их в тренировки</p>
          <Button asChild size="lg">
            <Link to="/workouts">К тренировкам</Link>
          </Button>
        </div>
      )}

      {exercises.isSuccess && exercises.data.length > 0 && visible?.length === 0 && (
        <p role="status" className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Ничего не найдено
        </p>
      )}

      {visible && visible.length > 0 && (
        <ul className="space-y-2">
          {visible.map((exercise) => {
            const firstMedia = exercise.media[0];
            return (
              <li key={exercise.id}>
                <Link
                  to={`/exercises/${exercise.id}`}
                  className="flex min-h-14 items-center gap-3 rounded-xl px-2 outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
                    {firstMedia ? <MediaThumb media={firstMedia} /> : <ImageOff className="size-5" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1 wrap-anywhere">{exercise.name}</span>
                  {/* «медиа» — неизменяемое слово, форма одна для любого числа. */}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {firstMedia ? `${exercise.media.length} медиа` : 'Нет медиа'}
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
