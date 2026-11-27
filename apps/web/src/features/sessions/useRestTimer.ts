import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { RestPushApi } from '@/features/rest-push/useRestPush';
import {
  addTime,
  advanceTimer,
  getBrowserStorage,
  getRemainingMs,
  restoreTimer,
  saveTimer,
  startTimer,
  type RestTimerState,
} from './restTimer';

const TICK_MS = 250;
const VIBRATION_PATTERN = [200, 100, 200];

export type RestTimerStatus = 'idle' | 'running' | 'finished';

export interface RestTimerApi {
  status: RestTimerStatus;
  remainingMs: number;
  durationMs: number;
  /** Абсолютный срок идущего таймера (мс, Date.now()) или null. */
  endsAt: number | null;
  start: (seconds: number) => void;
  addTime: () => void;
  skip: () => void;
}

/** Контекст маршрута активной тренировки: общий таймер и управление уведомлениями. */
export interface ActiveSessionContext {
  timer: RestTimerApi;
  restPush: RestPushApi;
}

export interface RestTimerOptions {
  /**
   * Событие ручного изменения таймера: старт, продление, пропуск. Естественное истечение
   * сюда не попадает — оно не отменяет запланированную на сервере отправку.
   */
  onTimerChange?: (endsAt: number | null) => void;
}

interface TimerSnapshot {
  sessionId: string | undefined;
  timer: RestTimerState | null;
  finished: boolean;
  now: number;
}

function loadSnapshot(sessionId: string | undefined): TimerSnapshot {
  const now = Date.now();
  const timer = sessionId ? restoreTimer(getBrowserStorage(), sessionId, now) : null;
  return { sessionId, timer, finished: false, now };
}

/** Общий таймер интерфейса, привязанный к текущей активной сессии. */
export function useRestTimer(sessionId: string | undefined, options?: RestTimerOptions): RestTimerApi {
  const [snapshot, setSnapshot] = useState(() => loadSnapshot(sessionId));
  if (snapshot.sessionId !== sessionId) setSnapshot(loadSnapshot(sessionId));

  const { timer, finished, now } = snapshot;
  const expiredTimer = useRef<RestTimerState | null>(null);

  /** Сообщает о ручном изменении таймера (например, серверу уведомлений). */
  const notifyChange = (changed: RestTimerState | null) => {
    options?.onTimerChange?.(changed === null ? null : changed.endsAt);
  };

  const update = useCallback((next: RestTimerState | null, finished: boolean, now: number) => {
    if (!sessionId) return;
    setSnapshot({ sessionId, timer: next, finished, now });
    saveTimer(getBrowserStorage(), sessionId, next);
  }, [sessionId]);

  const tick = useEffectEvent(() => {
    if (!timer || expiredTimer.current === timer) return;
    const current = Date.now();
    const { state, justFinished } = advanceTimer(timer, current);
    if (justFinished) {
      expiredTimer.current = timer;
      update(state, true, current);
      navigator.vibrate?.(VIBRATION_PATTERN);
    } else {
      setSnapshot((previous) => previous.timer === timer ? { ...previous, now: current } : previous);
    }
  });

  const running = timer !== null;
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => tick(), TICK_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [running, sessionId]);

  return {
    status: timer ? 'running' : finished ? 'finished' : 'idle',
    remainingMs: timer ? getRemainingMs(timer.endsAt, now) : 0,
    durationMs: timer?.durationMs ?? 0,
    endsAt: timer ? timer.endsAt : null,
    start: (seconds) => {
      const current = Date.now();
      const next = startTimer(seconds, current);
      update(next, false, current);
      notifyChange(next);
    },
    addTime: () => {
      const current = Date.now();
      const next = addTime(timer ?? { endsAt: current, durationMs: 0 }, current);
      update(next, false, current);
      notifyChange(next);
    },
    skip: () => {
      update(null, false, Date.now());
      notifyChange(null);
    },
  };
}
