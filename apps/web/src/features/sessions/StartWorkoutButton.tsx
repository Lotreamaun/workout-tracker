import { Play } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { formatSaveError } from '@/features/workouts/formatError';
import { useStartSession } from './hooks';

function activeSessionId(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== 'SESSION_IN_PROGRESS') return null;
  const details = error.details;
  if (details && typeof details === 'object' && 'sessionId' in details && typeof details.sessionId === 'string') {
    return details.sessionId;
  }
  return null;
}

interface StartWorkoutButtonProps {
  workoutId: string;
  size?: 'default' | 'lg';
  className?: string;
}

/** Запуск сессии из шаблона. При активной сессии (409) предлагает перейти к ней. */
export function StartWorkoutButton({ workoutId, size = 'default', className }: StartWorkoutButtonProps) {
  const navigate = useNavigate();
  const start = useStartSession();
  const conflictSessionId = activeSessionId(start.error);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size={size}
        className={className}
        disabled={start.isPending}
        onClick={() => start.mutate(workoutId, { onSuccess: (session) => navigate(`/sessions/${session.id}`) })}
      >
        <Play aria-hidden /> {start.isPending ? 'Запускаем…' : 'Начать'}
      </Button>

      {conflictSessionId && (
        <div role="alert" className="space-y-2 rounded-lg border border-primary/50 p-3 text-sm">
          <p>Уже есть активная тренировка. Завершите или отмените её, чтобы начать новую.</p>
          <Button asChild variant="secondary" size="sm">
            <Link to={`/sessions/${conflictSessionId}`}>Перейти к активной</Link>
          </Button>
        </div>
      )}
      {start.isError && !conflictSessionId && (
        <p role="alert" className="text-sm text-destructive">
          {formatSaveError(start.error).join(' ')}
        </p>
      )}
    </div>
  );
}
