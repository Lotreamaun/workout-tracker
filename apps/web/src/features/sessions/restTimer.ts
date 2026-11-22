/** Состояние таймера отдыха: оставшееся время всегда считается от целевого timestamp `endsAt` (мс, Date.now()). */
export interface RestTimerState {
  endsAt: number;
  durationMs: number;
}

/** Минимальный интерфейс хранилища (подмножество Storage), чтобы логику можно было тестировать без DOM. */
export type TimerStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const REST_ADD_MS = 15_000;

export function restStorageKey(sessionId: string): string {
  return `wt:rest:${sessionId}`;
}

export function getRemainingMs(endsAt: number, now: number): number {
  return Math.max(0, endsAt - now);
}

export function startTimer(seconds: number, now: number): RestTimerState {
  const durationMs = Math.max(0, Math.round(seconds * 1000));
  return { endsAt: now + durationMs, durationMs };
}

/** +15 с: у идущего таймера сдвигает окончание, у закончившегося — запускает новый отсчёт от `now`. */
export function addTime(state: RestTimerState, now: number, extraMs: number = REST_ADD_MS): RestTimerState {
  if (getRemainingMs(state.endsAt, now) === 0) return { endsAt: now + extraMs, durationMs: extraMs };
  return { endsAt: state.endsAt + extraMs, durationMs: state.durationMs + extraMs };
}

export interface AdvanceResult {
  state: RestTimerState | null;
  /** true ровно в тот момент, когда таймер дошёл до нуля (для вибрации и акцента). */
  justFinished: boolean;
}

/** Шаг тика: закончившийся таймер снимается, о завершении сообщается один раз. */
export function advanceTimer(state: RestTimerState | null, now: number): AdvanceResult {
  if (state && getRemainingMs(state.endsAt, now) === 0) return { state: null, justFinished: true };
  return { state, justFinished: false };
}

export function parseTimer(raw: string | null): RestTimerState | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { endsAt, durationMs } = value as Record<string, unknown>;
    if (typeof endsAt !== 'number' || typeof durationMs !== 'number') return null;
    if (!Number.isFinite(endsAt) || !Number.isFinite(durationMs) || durationMs <= 0) return null;
    return { endsAt, durationMs };
  } catch {
    return null;
  }
}

/** Сохраняет (или удаляет при `null`) состояние; любые ошибки хранилища игнорируются. */
export function saveTimer(storage: TimerStorage | null, sessionId: string, state: RestTimerState | null): void {
  if (!storage) return;
  try {
    if (state) storage.setItem(restStorageKey(sessionId), JSON.stringify(state));
    else storage.removeItem(restStorageKey(sessionId));
  } catch {
    // хранилище недоступно (приватный режим, переполнение) — таймер работает только в памяти
  }
}

/**
 * Восстанавливает таймер после перезагрузки: идущий возвращается как есть, закончившийся
 * или повреждённый запись удаляется (без повторной вибрации «по старому» таймеру).
 */
export function restoreTimer(storage: TimerStorage | null, sessionId: string, now: number): RestTimerState | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(restStorageKey(sessionId));
  } catch {
    return null;
  }
  const state = parseTimer(raw);
  if (!state || getRemainingMs(state.endsAt, now) === 0) {
    if (raw !== null) saveTimer(storage, sessionId, null);
    return null;
  }
  return state;
}

/** localStorage, если он доступен (обращение к нему может бросать исключение). */
export function getBrowserStorage(): TimerStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Формат «м:сс» для отображения оставшегося времени (округление вверх до секунды). */
export function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
