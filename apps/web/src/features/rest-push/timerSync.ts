import { ApiError } from '@/lib/api';
import { getBrowserStorage, type TimerStorage } from '@/features/sessions/restTimer';
import { restPushApi } from './client';
import type { RestPushTimerInput } from '@wt/shared';

const REVISION_KEY = 'wt:restPush:revision';
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000];

/** События синхронизации для интерфейса. */
export type RestPushSyncEvent =
  | { type: 'failed' }
  | { type: 'recovered' }
  | { type: 'lost' };

export interface RestPushTimerSync {
  /** Привязать подписку сервера; null — доставка изменений выключена. */
  configure(subscriptionId: string | null): void;
  /**
   * Запомнить актуальное состояние таймера (endsAt в мс или null — отмена) и доставить на сервер.
   * Запросы упорядочены: одновременно летит только один, ставится самое свежее состояние.
   */
  schedule(sessionId: string, endsAtMs: number | null): void;
  subscribe(listener: (event: RestPushSyncEvent) => void): () => void;
}

export interface TimerSyncOptions {
  storage: TimerStorage | null;
  send: (subscriptionId: string, input: RestPushTimerInput) => Promise<void>;
  retryDelays?: number[];
}

/**
 * Синхронизация общего таймера с сервером уведомлений.
 * Ревизия возрастает с каждым запросом и переживает перезагрузку; при повторной отправке
 * выделяется новая ревизия, чтобы повтор не был отброшен сервером как уже обработанный.
 */
export function createRestPushTimerSync(options: TimerSyncOptions): RestPushTimerSync {
  const { storage, send } = options;
  const retryDelays = options.retryDelays ?? RETRY_DELAYS_MS;
  const listeners = new Set<(event: RestPushSyncEvent) => void>();

  let subscriptionId: string | null = null;
  let pending: { sessionId: string; endsAtMs: number | null } | null = null;
  let flushing = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryAttempt = 0;
  let failing = false;
  let lastRevision = 0;
  let configuration = 0;

  function emit(event: RestPushSyncEvent): void {
    listeners.forEach((listener) => listener(event));
  }

  /** Прочитанная ревизия установки; повреждённая или отсутствующая запись считается нулём. */
  function readStoredRevision(): number {
    try {
      const raw = storage?.getItem(REVISION_KEY);
      if (raw === null) return 0;
      const parsed = Number(raw);
      return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }

  /** Ревизия выделяется до отправки и сохраняется — при сбое процесса сервер примет более новую. */
  function nextRevision(): number {
    const next = Math.max(Date.now(), readStoredRevision(), lastRevision) + 1;
    lastRevision = next;
    try {
      storage?.setItem(REVISION_KEY, String(next));
    } catch {
      // хранилище недоступно — ревизия продолжает расти в памяти текущей загрузки
    }
    return next;
  }

  function clearRetry(): void {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function scheduleRetry(): void {
    if (retryTimer !== null) return;
    const delay = retryDelays[Math.min(retryAttempt, retryDelays.length - 1)];
    retryAttempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void flush();
    }, delay);
  }

  async function flush(): Promise<void> {
    if (flushing || subscriptionId === null || pending === null) return;
    const current = pending;
    if (current.endsAtMs !== null && current.endsAtMs <= Date.now()) {
      pending = null;
      return;
    }
    flushing = true;
    const startedIn = configuration;
    const input: RestPushTimerInput = {
      sessionId: current.sessionId,
      endsAt: current.endsAtMs === null ? null : new Date(current.endsAtMs).toISOString(),
      revision: nextRevision(),
    };
    try {
      await send(subscriptionId, input);
      if (configuration !== startedIn) return;
      if (pending === current) pending = null;
      retryAttempt = 0;
      if (failing) {
        failing = false;
        emit({ type: 'recovered' });
      }
    } catch (error) {
      if (configuration !== startedIn) return;
      if (error instanceof ApiError && error.status === 404) {
        // Подписка потеряна на сервере — интерфейс предложит повторное подключение.
        subscriptionId = null;
        configuration += 1;
        emit({ type: 'lost' });
      } else if (error instanceof ApiError && error.status === 409) {
        // Сессия уже завершена — расписание неактуально, отменять на сервере нечего.
        if (pending === current) pending = null;
        retryAttempt = 0;
      } else {
        failing = true;
        emit({ type: 'failed' });
        if (pending === current) {
          const status = error instanceof ApiError ? error.status : undefined;
          if (status === undefined || status === 429 || status >= 500) scheduleRetry();
          else pending = null;
        }
      }
    } finally {
      flushing = false;
      // Изменение, пришедшее во время отправки, доставляется следующим запросом.
      if (retryTimer === null && pending !== null && subscriptionId !== null) void flush();
    }
  }

  return {
    configure(id) {
      if (id === subscriptionId) return;
      subscriptionId = id;
      configuration += 1;
      clearRetry();
      retryAttempt = 0;
      void flush();
    },
    schedule(sessionId, endsAtMs) {
      pending = { sessionId, endsAtMs };
      clearRetry();
      retryAttempt = 0;
      void flush();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Единственный экземпляр на установку: живёт вне React, чтобы переживать смену маршрутов. */
export const restPushTimerSync = createRestPushTimerSync({
  storage: getBrowserStorage(),
  send: (subscriptionId, input) => restPushApi.updateTimer(subscriptionId, input),
});
