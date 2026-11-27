import { useEffect, useRef, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router';
import type { Session, SessionExercise } from '@wt/shared';
import { Button } from '@/components/ui/button';
import { AutoTextarea } from '@/components/ui/auto-textarea';
import { formatSaveError } from '@/features/workouts/formatError';
import { ConfirmDialog } from './ConfirmDialog';
import { ExerciseCard } from './ExerciseCard';
import { RestTimer } from './RestTimerPanel';
import { formatTime } from './format';
import { useAbandonSession, useCompleteSession, useSaveSession } from './hooks';
import type { RestTimerApi } from './useRestTimer';

const NOTES_DEBOUNCE_MS = 600;
const DEFAULT_REST_SECONDS = 90;

interface ActiveSessionProps {
  session: Session;
}

export function ActiveSession({ session }: ActiveSessionProps) {
  const navigate = useNavigate();
  const { save, error: saveError, clearError } = useSaveSession(session.id);
  const complete = useCompleteSession(session.id);
  const abandon = useAbandonSession(session.id);
  const timer = useOutletContext<RestTimerApi>();

  const [notes, setNotes] = useState(session.notes ?? '');
  const [seenNotes, setSeenNotes] = useState(session.notes);
  if (seenNotes !== session.notes) {
    setSeenNotes(session.notes);
    setNotes(session.notes ?? '');
  }

  const commitNotes = () => {
    if (notes.trim() !== (session.notes ?? '')) save({ notes });
  };
  const commitNotesRef = useRef(commitNotes);
  useEffect(() => {
    commitNotesRef.current = commitNotes;
  });
  useEffect(() => {
    const id = setTimeout(() => commitNotesRef.current(), NOTES_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [notes]);
  useEffect(() => {
    const ref = commitNotesRef;
    return () => ref.current();
  }, []);

  const pendingSets = session.exercises
    .filter((e) => !e.isSkipped)
    .reduce((sum, e) => sum + e.sets.filter((s) => !s.isCompleted).length, 0);
  const nextRest = session.exercises.find(
    (e) => !e.isSkipped && e.restSeconds !== null && e.sets.some((s) => !s.isCompleted),
  )?.restSeconds;

  const onSetCompleted = (exercise: SessionExercise) => {
    if (exercise.restSeconds !== null && exercise.restSeconds > 0) timer.start(exercise.restSeconds);
  };

  return (
    <div className="space-y-4 pb-24">
      <p className="text-sm text-muted-foreground">Начата в {formatTime(session.startedAt)}</p>

      {saveError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/60 p-3 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="flex-1">Не удалось сохранить: {saveError}</p>
          <button type="button" className="underline" onClick={clearError}>
            Скрыть
          </button>
        </div>
      )}

      {session.exercises.map((exercise) => (
        <ExerciseCard
          key={exercise.exercisePosition}
          exercise={exercise}
          disabled={false}
          onSaveSet={(patch) => save({ sets: [patch] })}
          onToggleSkip={(exercisePosition, isSkipped) => save({ exercises: [{ exercisePosition, isSkipped }] })}
          onSetCompleted={onSetCompleted}
        />
      ))}

      <section className="space-y-2">
        <label htmlFor="session-notes" className="text-sm font-medium">
          Заметки к тренировке
        </label>
        <AutoTextarea
          id="session-notes"
          value={notes}
          maxLength={2000}
          placeholder="Самочувствие, замечания…"
          onChange={(e) => setNotes(e.target.value)}
          onBlur={commitNotes}
        />
      </section>

      <div className="space-y-3">
        <ConfirmDialog
          trigger={
            <Button type="button" size="lg" className="w-full">
              Завершить
            </Button>
          }
          title="Завершить тренировку?"
          description={
            pendingSets > 0
              ? `Не отмечено подходов: ${pendingSets}. Они останутся в истории невыполненными.`
              : 'Все подходы отмечены. Тренировка попадёт в историю.'
          }
          confirmLabel="Завершить"
          pendingLabel="Завершаем…"
          pending={complete.isPending}
          error={complete.isError ? formatSaveError(complete.error).join(' ') : null}
          onClose={() => complete.reset()}
          onConfirm={() =>
            complete.mutate(notes, {
              onSuccess: (done) => {
                timer.skip();
                navigate(`/history/${done.id}`, { replace: true });
              },
            })
          }
        />
        <ConfirmDialog
          trigger={
            <Button type="button" variant="outline" size="lg" className="w-full text-destructive">
              Отменить тренировку
            </Button>
          }
          title="Отменить тренировку?"
          description="Тренировка не попадёт в историю завершённых. Шаблон не изменится."
          confirmLabel="Отменить тренировку"
          pendingLabel="Отменяем…"
          destructive
          pending={abandon.isPending}
          error={abandon.isError ? formatSaveError(abandon.error).join(' ') : null}
          onClose={() => abandon.reset()}
          onConfirm={() =>
            abandon.mutate(undefined, {
              onSuccess: () => {
                timer.skip();
                navigate('/', { replace: true });
              },
            })
          }
        />
      </div>

      <RestTimer timer={timer} manualSeconds={nextRest ?? DEFAULT_REST_SECONDS} />
    </div>
  );
}
