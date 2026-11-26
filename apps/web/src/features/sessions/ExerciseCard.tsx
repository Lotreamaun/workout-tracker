import { RotateCcw, SkipForward } from 'lucide-react';
import type { SessionExercise, SessionSetPatch } from '@wt/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MediaStrip } from '@/features/exercises/MediaStrip';
import { cn } from '@/lib/utils';
import { SetRow } from './SetRow';

interface ExerciseCardProps {
  exercise: SessionExercise;
  disabled: boolean;
  onSaveSet: (patch: SessionSetPatch) => void;
  onToggleSkip: (exercisePosition: number, isSkipped: boolean) => void;
  onSetCompleted: (exercise: SessionExercise) => void;
}

export function ExerciseCard({ exercise, disabled, onSaveSet, onToggleSkip, onSetCompleted }: ExerciseCardProps) {
  const done = exercise.sets.filter((s) => s.isCompleted).length;

  return (
    <Card className="gap-3 px-4" data-testid="session-exercise">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className={cn('text-lg font-semibold wrap-anywhere', exercise.isSkipped && 'text-muted-foreground line-through')}>
            {exercise.name}
          </h2>
          {exercise.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap wrap-anywhere">{exercise.description}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {exercise.isSkipped ? 'Пропущено' : `${done} из ${exercise.sets.length}`}
            {exercise.restSeconds !== null && ` · отдых ${exercise.restSeconds} с`}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onToggleSkip(exercise.exercisePosition, !exercise.isSkipped)}
        >
          {exercise.isSkipped ? <RotateCcw aria-hidden /> : <SkipForward aria-hidden />}
          {exercise.isSkipped ? 'Вернуть' : 'Пропустить'}
        </Button>
      </div>

      <MediaStrip title={exercise.name} media={exercise.media} />

      <ul className={cn('space-y-2', exercise.isSkipped && 'opacity-50')}>
        {exercise.sets.map((set) => (
          <SetRow
            key={set.id}
            set={set}
            disabled={disabled || exercise.isSkipped}
            onSave={onSaveSet}
            onCompleted={() => onSetCompleted(exercise)}
          />
        ))}
      </ul>
    </Card>
  );
}
