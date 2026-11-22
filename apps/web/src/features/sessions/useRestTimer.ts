import { useCallback, useEffect, useRef, useState } from 'react';
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
  start: (seconds: number) => void;
  addTime: () => void;
  /** Останавливает таймер или снимает индикацию «отдых окончен». */
  skip: () => void;
}

/** Таймер отдыха сессии: состояние в localStorage (`wt:rest:<sessionId>`), тик только перерисовывает. */
export function useRestTimer(sessionId: string): RestTimerApi {
  const [timer, setTimer] = useState<RestTimerState | null>(() => restoreTimer(getBrowserStorage(), sessionId, Date.now()));
  const [finished, setFinished] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timerRef = useRef(timer);

  const update = useCallback(
    (next: RestTimerState | null) => {
      timerRef.current = next;
      setTimer(next);
      saveTimer(getBrowserStorage(), sessionId, next);
    },
    [sessionId],
  );

  const tick = useCallback(() => {
    const current = Date.now();
    setNow(current);
    const { state, justFinished } = advanceTimer(timerRef.current, current);
    if (justFinished) {
      update(state);
      setFinished(true);
      navigator.vibrate?.(VIBRATION_PATTERN);
    }
  }, [update]);

  const running = timer !== null;
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(tick, TICK_MS);
    // setInterval замораживается в фоне — при возврате пересчитываем сразу.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [running, tick]);

  const start = useCallback(
    (seconds: number) => {
      setFinished(false);
      const current = Date.now();
      setNow(current);
      update(startTimer(seconds, current));
    },
    [update],
  );

  const add = useCallback(() => {
    const current = Date.now();
    setFinished(false);
    setNow(current);
    // Закончившийся таймер (null) перезапускается на +15 с: addTime при нулевом остатке стартует новый отсчёт.
    update(addTime(timerRef.current ?? { endsAt: current, durationMs: 0 }, current));
  }, [update]);

  const skip = useCallback(() => {
    setFinished(false);
    update(null);
  }, [update]);

  return {
    status: timer ? 'running' : finished ? 'finished' : 'idle',
    remainingMs: timer ? getRemainingMs(timer.endsAt, now) : 0,
    durationMs: timer?.durationMs ?? 0,
    start,
    addTime: add,
    skip,
  };
}
