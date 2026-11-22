import { ChevronRight, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router';
import { ApiErrorState } from '@/components/ApiErrorState';
import { formatDateTime, formatDuration, formatSetsProgress } from '@/features/sessions/format';
import { useSessions } from '@/features/sessions/hooks';

const HISTORY_LIMIT = 50;

export function HistoryPage() {
  const sessions = useSessions('completed', HISTORY_LIMIT);

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">История</h1>

      {sessions.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Загружаем историю…
        </p>
      )}
      {sessions.isError && <ApiErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />}
      {sessions.isSuccess && sessions.data.length === 0 && (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Завершённых тренировок пока нет.
        </p>
      )}
      {sessions.isSuccess && sessions.data.length > 0 && (
        <ul className="space-y-3">
          {sessions.data.map((session) => {
            const duration = formatDuration(session.startedAt, session.completedAt);
            return (
              <li key={session.id}>
                <Link
                  to={`/history/${session.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <div className="min-w-0">
                    <p className="text-lg font-semibold wrap-anywhere">{session.workoutNameSnapshot}</p>
                    <p className="text-sm text-muted-foreground">{formatDateTime(session.startedAt)}</p>
                    <p className="text-sm text-muted-foreground">
                      {duration && `${duration} · `}
                      {formatSetsProgress(session.completedSets, session.totalSets)}
                    </p>
                  </div>
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
