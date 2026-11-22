import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import type { ExerciseInput, Workout, WorkoutCreateInput } from '@wt/shared';
import { AutoTextarea } from '@/components/ui/auto-textarea';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DeleteWorkoutButton } from './DeleteWorkoutButton';
import { formatSaveError } from './formatError';
import { useSaveWorkout } from './hooks';

interface ExerciseForm {
  key: string;
  id?: string;
  name: string;
  description: string;
  plannedSets: string;
  plannedReps: string;
  plannedWeight: string;
  restSeconds: string;
  notes: string;
}

function emptyExercise(): ExerciseForm {
  return {
    key: crypto.randomUUID(),
    name: '',
    description: '',
    plannedSets: '3',
    plannedReps: '',
    plannedWeight: '',
    restSeconds: '',
    notes: '',
  };
}

function fromWorkout(workout: Workout): ExerciseForm[] {
  return workout.exercises.map((e) => ({
    key: e.id,
    id: e.id,
    name: e.name,
    description: e.description ?? '',
    plannedSets: String(e.plannedSets),
    plannedReps: e.plannedReps === null ? '' : String(e.plannedReps),
    plannedWeight: e.plannedWeight === null ? '' : String(e.plannedWeight),
    restSeconds: e.restSeconds === null ? '' : String(e.restSeconds),
    notes: e.notes ?? '',
  }));
}

// Пустое поле → null (не задано); нечисловой ввод → NaN, который сервер отклонит с понятной ошибкой.
function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  return trimmed === '' ? null : Number(trimmed);
}

function toExerciseInput(form: ExerciseForm): ExerciseInput {
  const sets = form.plannedSets.trim();
  return {
    ...(form.id ? { id: form.id } : {}),
    name: form.name,
    description: form.description,
    plannedSets: sets === '' ? 0 : Number(sets),
    plannedReps: parseOptionalNumber(form.plannedReps),
    plannedWeight: parseOptionalNumber(form.plannedWeight),
    restSeconds: parseOptionalNumber(form.restSeconds),
    notes: form.notes,
  };
}

interface WorkoutEditorProps {
  /** Не задан — создание новой тренировки. */
  workout?: Workout;
}

export function WorkoutEditor({ workout }: WorkoutEditorProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const save = useSaveWorkout(workout?.id);

  const [name, setName] = useState(workout?.name ?? '');
  const [description, setDescription] = useState(workout?.description ?? '');
  const [exercises, setExercises] = useState<ExerciseForm[]>(() => (workout ? fromWorkout(workout) : []));
  const [errors, setErrors] = useState<string[]>([]);

  const patchExercise = (key: string, patch: Partial<ExerciseForm>) =>
    setExercises((list) => list.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  const moveExercise = (index: number, delta: -1 | 1) =>
    setExercises((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      next.splice(target, 0, ...next.splice(index, 1));
      return next;
    });

  const removeExercise = (key: string) => setExercises((list) => list.filter((e) => e.key !== key));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setErrors([]);
    const input: WorkoutCreateInput = { name, description, exercises: exercises.map(toExerciseInput) };
    save.mutate(input, {
      onSuccess: (saved) => {
        // Редактор открыт из просмотра — возвращаемся на ту же запись истории, чтобы «Назад» не вёл обратно в форму.
        // Иначе (создание или прямой заход) заменяем форму просмотром.
        if (workout && location.key !== 'default') navigate(-1);
        else navigate(`/workouts/${saved.id}`, { replace: true });
      },
      onError: (error) => setErrors(formatSaveError(error)),
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <fieldset disabled={save.isPending} className="space-y-6">
        <Card className="gap-4 px-5">
          <div className="space-y-2">
            <Label htmlFor="workout-name">Название</Label>
            <AutoTextarea
              singleLine
              id="workout-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Например, Ноги"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workout-description">Описание</Label>
            <AutoTextarea
              id="workout-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              placeholder="Необязательно"
            />
          </div>
        </Card>

        <section aria-labelledby="exercises-heading" className="space-y-3">
          <h2 id="exercises-heading" className="text-lg font-semibold">
            Упражнения
          </h2>

          {exercises.length === 0 && (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Упражнений пока нет. Добавьте первое.
            </p>
          )}

          {exercises.map((exercise, index) => (
            <Card key={exercise.key} className="gap-4 px-5" data-testid="exercise-card">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">Упражнение {index + 1}</h3>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Переместить вверх"
                    disabled={index === 0}
                    onClick={() => moveExercise(index, -1)}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Переместить вниз"
                    disabled={index === exercises.length - 1}
                    onClick={() => moveExercise(index, 1)}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Удалить упражнение"
                    onClick={() => removeExercise(exercise.key)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${exercise.key}-name`}>Название</Label>
                <AutoTextarea
                  singleLine
                  id={`${exercise.key}-name`}
                  value={exercise.name}
                  onChange={(e) => patchExercise(exercise.key, { name: e.target.value })}
                  maxLength={120}
                  placeholder="Например, Присед"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor={`${exercise.key}-sets`}>Подходы</Label>
                  <Input
                    id={`${exercise.key}-sets`}
                    inputMode="numeric"
                    value={exercise.plannedSets}
                    onChange={(e) => patchExercise(exercise.key, { plannedSets: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${exercise.key}-reps`}>Повторы</Label>
                  <Input
                    id={`${exercise.key}-reps`}
                    inputMode="numeric"
                    value={exercise.plannedReps}
                    onChange={(e) => patchExercise(exercise.key, { plannedReps: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${exercise.key}-weight`}>Вес, кг</Label>
                  <Input
                    id={`${exercise.key}-weight`}
                    inputMode="decimal"
                    value={exercise.plannedWeight}
                    onChange={(e) => patchExercise(exercise.key, { plannedWeight: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${exercise.key}-rest`}>Отдых, сек</Label>
                  <Input
                    id={`${exercise.key}-rest`}
                    inputMode="numeric"
                    value={exercise.restSeconds}
                    onChange={(e) => patchExercise(exercise.key, { restSeconds: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${exercise.key}-description`}>Описание</Label>
                <AutoTextarea
                  id={`${exercise.key}-description`}
                  value={exercise.description}
                  onChange={(e) => patchExercise(exercise.key, { description: e.target.value })}
                  maxLength={2000}
                  placeholder="Необязательно"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${exercise.key}-notes`}>Заметки</Label>
                <AutoTextarea
                  id={`${exercise.key}-notes`}
                  value={exercise.notes}
                  onChange={(e) => patchExercise(exercise.key, { notes: e.target.value })}
                  maxLength={2000}
                  placeholder="Необязательно"
                />
              </div>
            </Card>
          ))}

          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={exercises.length >= 50}
            onClick={() => setExercises((list) => [...list, emptyExercise()])}
          >
            <Plus aria-hidden /> Добавить упражнение
          </Button>
        </section>
      </fieldset>

      {errors.length > 0 && (
        <div role="alert" className="space-y-1 rounded-xl border border-destructive/60 p-4 text-sm text-destructive">
          {errors.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={save.isPending}>
        {save.isPending ? 'Сохраняем…' : 'Сохранить'}
      </Button>

      {workout && <DeleteWorkoutButton workoutId={workout.id} />}
    </form>
  );
}
