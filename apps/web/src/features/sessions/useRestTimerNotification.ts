import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useToast } from '@/lib/use-toast';
import { useRestTimer, type RestTimerApi } from './useRestTimer';

/**
 * Оборачивает `useRestTimer`: при истечении отдыха показывает in-app уведомление,
 * если пользователь не на экране сессии. Возвращает тот же API таймера.
 */
export function useRestTimerNotification(sessionId: string): RestTimerApi {
  const timer = useRestTimer(sessionId);
  const { show } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const notified = useRef(false);

  useEffect(() => {
    if (sessionId === '') return;
    if (timer.status === 'finished' && !notified.current) {
      if (location.pathname !== `/sessions/${sessionId}`) {
        notified.current = true;
        show({
          title: 'Отдых окончен',
          body: 'Пора к следующему подходу',
          action: {
            label: 'К тренировке',
            onClick: () => navigate(`/sessions/${sessionId}`),
          },
        });
      }
    }
    if (timer.status === 'running' || timer.status === 'idle') {
      notified.current = false;
    }
  }, [timer.status, location.pathname, sessionId, show, navigate]);

  return timer;
}
