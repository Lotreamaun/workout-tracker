import { LoaderCircle } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router';
import { ApiErrorState } from '@/components/ApiErrorState';
import { Button } from '@/components/ui/button';
import { ActiveSession } from '@/features/sessions/ActiveSession';
import { useSession } from '@/features/sessions/hooks';
import { ApiError } from '@/lib/api';

export function ActiveSessionPage() {
  const { id } = useParams();
  const session = useSession(id);

  if (session.isSuccess && session.data.status === 'completed') {
    return <Navigate to={`/history/${session.data.id}`} replace />;
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">{session.data?.workoutNameSnapshot ?? 'Тренировка'}</h1>

      {session.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Загружаем…
        </p>
      )}
      {session.isError &&
        (session.error instanceof ApiError && session.error.status === 404 ? (
          <p role="alert" className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Тренировка не найдена.
          </p>
        ) : (
          <ApiErrorState error={session.error} onRetry={() => void session.refetch()} />
        ))}
      {session.isSuccess && session.data.status === 'abandoned' && (
        <div className="space-y-3 rounded-xl border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">Эта тренировка отменена.</p>
          <Button asChild>
            <Link to="/">На главную</Link>
          </Button>
        </div>
      )}
      {session.isSuccess && session.data.status === 'in_progress' && (
        <ActiveSession key={session.data.id} session={session.data} />
      )}
    </section>
  );
}
