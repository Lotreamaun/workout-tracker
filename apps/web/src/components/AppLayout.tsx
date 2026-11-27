import { Dumbbell, History, Home, Library, Sparkles, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet, useMatch } from 'react-router';
import { AccessKeyDialog } from '@/components/AccessKeyDialog';
import { ActiveSessionOverlay } from '@/features/sessions/ActiveSessionOverlay';
import { useSession, useSessions } from '@/features/sessions/hooks';
import { useRestTimer } from '@/features/sessions/useRestTimer';
import { cn } from '@/lib/utils';

const navItems: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Главная', icon: Home, end: true },
  { to: '/workouts', label: 'Тренировки', icon: Dumbbell },
  { to: '/exercises', label: 'Упражнения', icon: Library },
  { to: '/history', label: 'История', icon: History },
  { to: '/exchange', label: 'AI-обмен', icon: Sparkles },
];

export function AppLayout() {
  const routeSessionId = useMatch('/sessions/:id')?.params.id;
  const activeSession = useSessions('in_progress', 1).data?.[0];
  const routeSession = useSession(routeSessionId).data;
  const sessionId = routeSession?.status === 'in_progress' ? routeSession.id : activeSession?.id;
  const timer = useRestTimer(sessionId);
  const showOverlay = activeSession && activeSession.id !== routeSessionId;

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r p-4 md:flex md:sticky md:top-0 md:h-dvh md:self-start md:overflow-y-auto">
        <div className="mb-4 flex items-center gap-2 px-3 py-2 text-lg font-semibold">
          <Dumbbell className="size-5 text-primary" aria-hidden />
          Workout Tracker
        </div>
        <nav aria-label="Основная навигация" className="flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-accent',
                  isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
                )
              }
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Подложка под строкой состояния iOS (black-translucent): контент не уезжает под часы при скролле. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)] bg-background md:hidden"
      />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-4 md:px-8 md:pb-10">
        <Outlet context={timer} />
      </main>

      <div className="sticky bottom-0 z-40 md:hidden">
        {showOverlay && <ActiveSessionOverlay session={activeSession} timer={timer} />}
        <nav
          aria-label="Основная навигация"
          className="grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        >
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              <Icon className="size-6" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
      <AccessKeyDialog />
    </div>
  );
}
